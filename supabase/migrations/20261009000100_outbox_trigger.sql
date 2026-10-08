-- Phase 9: every new outbox row calls the send-notification Edge Function.
-- URL and shared secret live in Supabase Vault (set once, never in the repository).

create extension if not exists pg_net with schema extensions;

create function public.notify_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
  v_url text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_url';
  if v_secret is null or v_url is null then
    return new; -- not configured yet: the row simply waits in the outbox
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
  );
  return new;
end;
$$;

revoke execute on function public.notify_outbox() from public, anon, authenticated;

create trigger outbox_notify
  after insert on public.notifications_outbox
  for each row execute function public.notify_outbox();
