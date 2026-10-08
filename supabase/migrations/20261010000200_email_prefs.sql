-- Email preferences per account (families and Mats). Invitation/password emails are always sent.
alter table public.profiles
  add column notify_bookings boolean not null default true,
  add column notify_cancellations boolean not null default true,
  add column notify_report boolean not null default true; -- monthly payment report, only used for the admin

-- Families can't update profiles directly (RLS); this changes only the caller's own email settings.
create function public.set_email_prefs(p_bookings boolean, p_cancellations boolean, p_report boolean default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  update public.profiles
  set notify_bookings = coalesce(p_bookings, notify_bookings),
      notify_cancellations = coalesce(p_cancellations, notify_cancellations),
      notify_report = coalesce(p_report, notify_report)
  where id = auth.uid();
end;
$$;

revoke execute on function public.set_email_prefs(boolean, boolean, boolean) from public, anon;
grant execute on function public.set_email_prefs(boolean, boolean, boolean) to authenticated;
