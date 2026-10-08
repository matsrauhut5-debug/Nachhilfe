-- Late cancellations (less than cancel_hours before the lesson) cost 50 % of the price.
-- Families can now cancel late themselves; it becomes status 'late' with half the price.
-- The time becomes free again (only status 'booked' blocks time).

create or replace function public.cancel_booking(p_id uuid, p_reason text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  admin boolean := public.is_admin();
  b public.bookings;
  hours int := (select cancel_hours from public.settings where id = 1);
  reason text := case when admin then coalesce(p_reason, 'teacher') else 'family' end;
  fee numeric(10, 2);
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

  -- Family inside the deadline: late cancellation, 50 % charged
  if not admin and b.starts_at - now() <= make_interval(hours => hours) then
    if b.starts_at <= now() then
      raise exception 'This lesson has already started.' using errcode = 'P0001';
    end if;
    fee := round(b.price * 0.5, 2);
    update public.bookings
    set status = 'late', price = fee, cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'family'
    where id = p_id;
    insert into public.notifications_outbox (kind, family_id, payload)
    values ('late_cancelled', b.family_id,
            jsonb_build_object('starts', jsonb_build_array(b.starts_at), 'duration_min', b.duration_min,
                               'price', fee, 'full_price', b.price, 'by', 'family'));
    return;
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

create or replace function public.mark_late_cancel(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.bookings;
  fee numeric(10, 2);
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_id and status = 'booked' for update;
  if not found then
    raise exception 'Only booked lessons can be marked as a late cancellation.' using errcode = 'P0001';
  end if;
  fee := round(b.price * 0.5, 2);
  update public.bookings
  set status = 'late', price = fee, cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'family'
  where id = p_id;
  insert into public.notifications_outbox (kind, family_id, payload)
  values ('late_cancelled', b.family_id,
          jsonb_build_object('starts', jsonb_build_array(b.starts_at), 'duration_min', b.duration_min,
                             'price', fee, 'full_price', b.price, 'by', 'admin'));
end;
$$;
