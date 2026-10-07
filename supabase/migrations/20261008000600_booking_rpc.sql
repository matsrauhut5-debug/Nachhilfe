-- Phase 6: free times, booking, cancelling, ending series.
-- All checks happen here; the website only shows what these functions allow.
-- Messages raised with errcode P0001 are shown to the user as they are.

------------------------------------------------------------
-- Internal helpers (not callable from the website)
------------------------------------------------------------

create function public.app_tz() returns text
language sql stable security definer set search_path = '' as $$
  select timezone from public.settings where id = 1;
$$;

-- Free 30-minute slots of a date (admin's time zone): override if present, else usual hours
create function public.day_slots(p_date date) returns int[]
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.availability_override where date = p_date) then
      coalesce((
        select array_agg(m order by m)
        from public.availability_override o,
             jsonb_array_elements(o.windows) w,
             generate_series((w->>0)::int, (w->>1)::int - 30, 30) m
        where o.date = p_date), '{}')
    else
      coalesce((
        select array_agg(m order by m)
        from public.availability_template t, generate_series(t.start_min, t.end_min - 30, 30) m
        where t.weekday = extract(dow from p_date)), '{}')
  end;
$$;

-- Can a lesson of p_dur minutes start at p_start?
create function public.slot_free(p_start timestamptz, p_dur int, p_tz text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  local timestamp := p_start at time zone p_tz;
  m int := extract(hour from local)::int * 60 + extract(minute from local)::int;
  slots int[];
begin
  if p_start <= now() or date_trunc('minute', p_start) <> p_start or m % 30 <> 0 or m + p_dur > 1440 then
    return false;
  end if;
  slots := public.day_slots(local::date);
  for x in 0 .. (p_dur / 30 - 1) loop
    if not ((m + x * 30) = any (slots)) then
      return false;
    end if;
  end loop;
  return not exists (
    select 1 from public.bookings
    where status = 'booked'
      and tstzrange(starts_at, ends_at) && tstzrange(p_start, p_start + make_interval(mins => p_dur))
  );
end;
$$;

-- Weekly dates of a series: same clock time in p_tz, +7 days, while < p_until (max 53 dates)
create function public.series_starts(p_start timestamptz, p_until timestamptz, p_tz text)
returns setof timestamptz
language sql stable set search_path = '' as $$
  select ((((p_start at time zone p_tz)::date + 7 * i)::timestamp + ((p_start at time zone p_tz)::time)) at time zone p_tz)
  from generate_series(0, 52) i
  where i = 0
     or (p_until is not null
         and ((((p_start at time zone p_tz)::date + 7 * i)::timestamp + ((p_start at time zone p_tz)::time)) at time zone p_tz) < p_until)
  order by 1;
$$;

-- Caller must be the admin or an active family
create function public.assert_can_book() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and (role = 'admin' or active)
  ) then
    raise exception 'Your account has been deactivated. Please reach out to Mats.' using errcode = '42501';
  end if;
end;
$$;

------------------------------------------------------------
-- Settings a family may know
------------------------------------------------------------

create function public.booking_info() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_can_book();
  return (select jsonb_build_object('cancel_hours', cancel_hours) from public.settings where id = 1);
end;
$$;

------------------------------------------------------------
-- Free start times
------------------------------------------------------------

create function public.get_free_starts(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, max_duration int)
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := public.app_tz();
  v_from timestamptz := greatest(p_from, now());
  v_to timestamptz := least(p_to, now() + interval '84 days');
  d date;
  m int;
  s timestamptz;
  dur int;
begin
  perform public.assert_can_book();
  if v_from >= v_to then
    return;
  end if;
  for d in select generate_series((v_from at time zone tz)::date, (v_to at time zone tz)::date, interval '1 day')::date loop
    foreach m in array public.day_slots(d) loop
      s := (d::timestamp + make_interval(mins => m)) at time zone tz;
      continue when s < v_from or s >= v_to;
      foreach dur in array array[120, 90, 60] loop
        if public.slot_free(s, dur, tz) then
          starts_at := s;
          max_duration := dur;
          return next;
          exit;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

------------------------------------------------------------
-- Series preview (which weeks are free)
------------------------------------------------------------

create function public.preview_series(p_starts_at timestamptz, p_duration int, p_repeat_until timestamptz)
returns table (starts_at timestamptz, free boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := public.app_tz();
begin
  perform public.assert_can_book();
  return query
    select s, public.slot_free(s, p_duration, tz)
    from public.series_starts(p_starts_at, p_repeat_until, tz) s;
end;
$$;

------------------------------------------------------------
-- Book one lesson or a weekly series
------------------------------------------------------------

create function public.book_lessons(
  p_starts_at timestamptz,
  p_duration int,
  p_repeat_until timestamptz default null,
  p_family_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  tz text := public.app_tz();
  admin boolean := public.is_admin();
  fam uuid;
  prof public.profiles;
  v_price numeric(10, 2);
  s timestamptz;
  booked timestamptz[] := '{}';
  skipped timestamptz[] := '{}';
  sid uuid;
begin
  perform public.assert_can_book();
  if admin then
    if p_family_id is null then
      raise exception 'Please choose a student.' using errcode = 'P0001';
    end if;
    fam := p_family_id;
  else
    if p_family_id is not null and p_family_id <> auth.uid() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    fam := auth.uid();
  end if;

  select * into prof from public.profiles where id = fam and role = 'family';
  if not found then
    raise exception 'Student not found.' using errcode = 'P0001';
  end if;
  if not prof.active then
    raise exception 'This account is deactivated.' using errcode = 'P0001';
  end if;
  if p_duration is null or p_duration not in (60, 90, 120) then
    raise exception 'Please choose 1, 1.5 or 2 hours.' using errcode = 'P0001';
  end if;
  v_price := case p_duration when 60 then prof.price_60 when 90 then prof.price_90 else prof.price_120 end;
  if v_price is null then
    raise exception 'There is no price for this length yet. Please message Mats.' using errcode = 'P0001';
  end if;
  if p_starts_at > now() + interval '84 days' then
    raise exception 'Lessons can be booked up to 12 weeks ahead.' using errcode = 'P0001';
  end if;
  if not public.slot_free(p_starts_at, p_duration, tz) then
    raise exception 'This time is no longer available. Please choose another one.' using errcode = 'P0001';
  end if;

  for s in select * from public.series_starts(p_starts_at, p_repeat_until, tz) loop
    if s = p_starts_at or public.slot_free(s, p_duration, tz) then
      booked := booked || s;
    else
      skipped := skipped || s;
    end if;
  end loop;

  if cardinality(booked) > 1 then
    sid := gen_random_uuid();
  end if;

  begin
    insert into public.bookings (family_id, starts_at, ends_at, duration_min, series_id, price, created_by)
    select fam, b, b, p_duration, sid, v_price, auth.uid() from unnest(booked) b; -- ends_at set by trigger
  exception when exclusion_violation then
    raise exception 'This time was just booked by someone else. Please choose another one.' using errcode = 'P0001';
  end;

  insert into public.notifications_outbox (kind, family_id, payload)
  values (
    case when sid is null then 'booked' else 'series_booked' end,
    fam,
    jsonb_build_object('starts', to_jsonb(booked), 'skipped', to_jsonb(skipped), 'duration_min', p_duration,
                       'price', v_price, 'series_id', sid, 'by', case when admin then 'admin' else 'family' end)
  );

  return jsonb_build_object('booked', to_jsonb(booked), 'skipped', to_jsonb(skipped), 'series_id', sid);
end;
$$;

------------------------------------------------------------
-- Cancel one lesson
------------------------------------------------------------

create function public.cancel_booking(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  admin boolean := public.is_admin();
  b public.bookings;
  hours int := (select cancel_hours from public.settings where id = 1);
begin
  perform public.assert_can_book();
  select * into b from public.bookings where id = p_id for update;
  if not found or (not admin and b.family_id <> auth.uid()) then
    raise exception 'Lesson not found.' using errcode = 'P0001';
  end if;
  if b.status <> 'booked' then
    raise exception 'This lesson is already cancelled.' using errcode = 'P0001';
  end if;
  if not admin and b.starts_at - now() <= make_interval(hours => hours) then
    raise exception 'It is too late to cancel this lesson online. Please message Mats directly.' using errcode = 'P0001';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid() where id = p_id;

  insert into public.notifications_outbox (kind, family_id, payload)
  values ('cancelled', b.family_id,
          jsonb_build_object('starts', jsonb_build_array(b.starts_at), 'duration_min', b.duration_min, 'price', b.price,
                             'by', case when admin then 'admin' else 'family' end));
end;
$$;

------------------------------------------------------------
-- End a series: cancel its future lessons (families: only outside the deadline)
------------------------------------------------------------

create function public.end_series(p_series_id uuid, p_from timestamptz default now()) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  admin boolean := public.is_admin();
  hours int := (select cancel_hours from public.settings where id = 1);
  v_from timestamptz := greatest(coalesce(p_from, now()), now());
  fam uuid;
  done timestamptz[];
  v_kept int;
begin
  perform public.assert_can_book();
  select family_id into fam from public.bookings where series_id = p_series_id limit 1;
  if fam is null or (not admin and fam <> auth.uid()) then
    raise exception 'Series not found.' using errcode = 'P0001';
  end if;

  with c as (
    update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
    where series_id = p_series_id
      and status = 'booked'
      and starts_at >= v_from
      and (admin or starts_at - now() > make_interval(hours => hours))
    returning starts_at
  )
  select coalesce(array_agg(starts_at order by starts_at), '{}') into done from c;

  select count(*) into v_kept from public.bookings
  where series_id = p_series_id and status = 'booked' and starts_at >= now();

  if cardinality(done) > 0 then
    insert into public.notifications_outbox (kind, family_id, payload)
    values ('series_ended', fam,
            jsonb_build_object('starts', to_jsonb(done), 'kept', v_kept, 'by', case when admin then 'admin' else 'family' end));
  end if;

  return jsonb_build_object('cancelled', cardinality(done), 'kept', v_kept);
end;
$$;

------------------------------------------------------------
-- Admin: late cancellation (still charged)
------------------------------------------------------------

create function public.mark_late_cancel(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.bookings set status = 'late', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_id and status = 'booked';
  if not found then
    raise exception 'Only booked lessons can be marked as a late cancellation.' using errcode = 'P0001';
  end if;
end;
$$;

------------------------------------------------------------
-- Permissions
------------------------------------------------------------

revoke execute on function public.app_tz() from public, anon, authenticated;
revoke execute on function public.day_slots(date) from public, anon, authenticated;
revoke execute on function public.slot_free(timestamptz, int, text) from public, anon, authenticated;
revoke execute on function public.series_starts(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.assert_can_book() from public, anon, authenticated;

revoke execute on function public.booking_info() from public, anon;
revoke execute on function public.get_free_starts(timestamptz, timestamptz) from public, anon;
revoke execute on function public.preview_series(timestamptz, int, timestamptz) from public, anon;
revoke execute on function public.book_lessons(timestamptz, int, timestamptz, uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.end_series(uuid, timestamptz) from public, anon;
revoke execute on function public.mark_late_cancel(uuid) from public, anon;

grant execute on function public.booking_info() to authenticated;
grant execute on function public.get_free_starts(timestamptz, timestamptz) to authenticated;
grant execute on function public.preview_series(timestamptz, int, timestamptz) to authenticated;
grant execute on function public.book_lessons(timestamptz, int, timestamptz, uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.end_series(uuid, timestamptz) to authenticated;
grant execute on function public.mark_late_cancel(uuid) to authenticated;
