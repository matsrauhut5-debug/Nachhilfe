-- Phase 5: save usual hours and day overrides atomically.
-- security invoker: RLS (admin only) still applies; the is_admin() check gives a clear error.

create function public.normalize_windows(p_windows jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  w jsonb;
  s int;
  e int;
  out jsonb := '[]'::jsonb;
begin
  if p_windows is null or jsonb_typeof(p_windows) <> 'array' then
    raise exception 'Windows must be a list' using errcode = '22023';
  end if;
  for w in select value from jsonb_array_elements(p_windows) order by (value->>0)::int loop
    s := (w->>0)::int;
    e := (w->>1)::int;
    if s is null or e is null or s % 30 <> 0 or e % 30 <> 0 or s < 0 or e > 1440 or s >= e then
      raise exception 'Invalid time window %', w using errcode = '22023';
    end if;
    -- merge touching/overlapping windows
    if jsonb_array_length(out) > 0 and s <= (out->-1->>1)::int then
      out := jsonb_set(out, array[(jsonb_array_length(out) - 1)::text, '1'],
                       to_jsonb(greatest(e, (out->-1->>1)::int)));
    else
      out := out || jsonb_build_array(jsonb_build_array(s, e));
    end if;
  end loop;
  return out;
end;
$$;

create function public.template_windows(p_weekday int) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(start_min, end_min) order by start_min), '[]'::jsonb)
  from public.availability_template where weekday = p_weekday;
$$;

-- Replace the usual hours of one weekday (0 = Sunday … 6 = Saturday)
create function public.set_template_day(p_weekday int, p_windows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  norm jsonb := public.normalize_windows(p_windows);
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.availability_template where weekday = p_weekday;
  insert into public.availability_template (weekday, start_min, end_min)
  select p_weekday, (w->>0)::int, (w->>1)::int from jsonb_array_elements(norm) w;
end;
$$;

-- Set the hours of one date. p_windows = null resets the day to the usual hours.
-- An override identical to the usual hours is removed automatically.
create function public.set_override(p_date date, p_windows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  norm jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_windows is null then
    delete from public.availability_override where date = p_date;
    return;
  end if;
  norm := public.normalize_windows(p_windows);
  if norm = public.template_windows(extract(dow from p_date)::int) then
    delete from public.availability_override where date = p_date;
  else
    insert into public.availability_override (date, windows) values (p_date, norm)
    on conflict (date) do update set windows = excluded.windows;
  end if;
end;
$$;

revoke execute on function public.normalize_windows(jsonb) from public, anon;
revoke execute on function public.template_windows(int) from public, anon;
revoke execute on function public.set_template_day(int, jsonb) from public, anon;
revoke execute on function public.set_override(date, jsonb) from public, anon;
grant execute on function public.normalize_windows(jsonb) to authenticated;
grant execute on function public.template_windows(int) to authenticated;
grant execute on function public.set_template_day(int, jsonb) to authenticated;
grant execute on function public.set_override(date, jsonb) to authenticated;
