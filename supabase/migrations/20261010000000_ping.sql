-- Phase 11: tiny public function the keep-alive workflow calls so the free project isn't paused
create function public.ping() returns text
language sql stable set search_path = '' as $$
  select 'ok'::text;
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
