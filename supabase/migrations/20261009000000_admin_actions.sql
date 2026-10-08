-- Phase 7: admin helpers

-- "Don't charge": a late cancellation becomes a normal cancellation
create function public.unmark_late(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.bookings set status = 'cancelled', paid = false where id = p_id and status = 'late';
  if not found then
    raise exception 'This lesson is not a late cancellation.' using errcode = 'P0001';
  end if;
end;
$$;

-- New secret for the Apple Calendar link (the old link stops working)
create function public.regenerate_ics_token() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.settings set ics_token = t where id = 1;
  return t;
end;
$$;

revoke execute on function public.unmark_late(uuid) from public, anon;
revoke execute on function public.regenerate_ics_token() from public, anon;
grant execute on function public.unmark_late(uuid) to authenticated;
grant execute on function public.regenerate_ics_token() to authenticated;
