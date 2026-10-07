-- Clearer message when the session has expired
create or replace function public.assert_can_book() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and (role = 'admin' or active)) then
    raise exception 'Your account has been deactivated. Please reach out to Mats.' using errcode = '42501';
  end if;
end;
$$;
