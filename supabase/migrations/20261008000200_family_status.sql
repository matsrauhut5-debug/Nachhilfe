-- Phase 4: lets the admin see whether a family has accepted its invitation.
-- auth.users is not readable from the browser, so this admin-only function exposes just the timestamp.

create function public.family_login_status()
returns table (id uuid, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, u.last_sign_in_at
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.role = 'family';
end;
$$;

revoke execute on function public.family_login_status() from public, anon;
grant execute on function public.family_login_status() to authenticated;
