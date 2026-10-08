-- Why Mats cancelled: 'teacher' (Mats can't make it) or 'family' (family asked, e.g. via WhatsApp).
-- Families cancelling themselves are always 'family'. Late cancellations now also send emails.

alter table public.bookings add column cancel_reason text check (cancel_reason in ('teacher', 'family'));

alter table public.notifications_outbox drop constraint notifications_outbox_kind_check;
alter table public.notifications_outbox add constraint notifications_outbox_kind_check
  check (kind in ('booked', 'series_booked', 'cancelled', 'series_ended', 'late_cancelled'));

drop function public.cancel_booking(uuid);
drop function public.end_series(uuid, timestamptz);
drop function public.mark_late_cancel(uuid);

create function public.cancel_booking(p_id uuid, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  admin boolean := public.is_admin();
  b public.bookings;
  hours int := (select cancel_hours from public.settings where id = 1);
  reason text := case when admin then coalesce(p_reason, 'teacher') else 'family' end;
begin
  perform public.assert_can_book();
  if reason not in ('teacher', 'family') then
    raise exception 'Unknown reason.' using errcode = 'P0001';
  end if;
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

  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = reason
  where id = p_id;

  insert into public.notifications_outbox (kind, family_id, payload)
  values ('cancelled', b.family_id,
          jsonb_build_object('starts', jsonb_build_array(b.starts_at), 'duration_min', b.duration_min, 'price', b.price,
                             'by', case when admin then 'admin' else 'family' end, 'reason', reason));
end;
$$;

create function public.end_series(p_series_id uuid, p_from timestamptz default now(), p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  admin boolean := public.is_admin();
  hours int := (select cancel_hours from public.settings where id = 1);
  v_from timestamptz := greatest(coalesce(p_from, now()), now());
  reason text := case when admin then coalesce(p_reason, 'teacher') else 'family' end;
  fam uuid;
  v_dur int;
  done timestamptz[];
  v_kept int;
begin
  perform public.assert_can_book();
  if reason not in ('teacher', 'family') then
    raise exception 'Unknown reason.' using errcode = 'P0001';
  end if;
  select family_id, duration_min into fam, v_dur from public.bookings where series_id = p_series_id limit 1;
  if fam is null or (not admin and fam <> auth.uid()) then
    raise exception 'Series not found.' using errcode = 'P0001';
  end if;

  with c as (
    update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = reason
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
            jsonb_build_object('starts', to_jsonb(done), 'kept', v_kept, 'duration_min', v_dur,
                               'by', case when admin then 'admin' else 'family' end, 'reason', reason));
  end if;

  return jsonb_build_object('cancelled', cardinality(done), 'kept', v_kept);
end;
$$;

create function public.mark_late_cancel(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.bookings;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.bookings set status = 'late', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'family'
  where id = p_id and status = 'booked'
  returning * into b;
  if not found then
    raise exception 'Only booked lessons can be marked as a late cancellation.' using errcode = 'P0001';
  end if;
  insert into public.notifications_outbox (kind, family_id, payload)
  values ('late_cancelled', b.family_id,
          jsonb_build_object('starts', jsonb_build_array(b.starts_at), 'duration_min', b.duration_min, 'price', b.price, 'by', 'admin'));
end;
$$;

revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.end_series(uuid, timestamptz, text) from public, anon;
revoke execute on function public.mark_late_cancel(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.end_series(uuid, timestamptz, text) to authenticated;
grant execute on function public.mark_late_cancel(uuid) to authenticated;
