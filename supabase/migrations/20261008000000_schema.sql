-- Phase 2: Tabellen, Constraints, Trigger, RLS
-- Zeitpunkte als timestamptz. Tageszeiten als Minuten seit Mitternacht in settings.timezone.

------------------------------------------------------------
-- Tabellen
------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'family' check (role in ('admin', 'family')),
  student_name text,
  parent_name text,
  email text not null,
  color text,
  price_60 numeric(10, 2),
  price_90 numeric(10, 2),
  price_120 numeric(10, 2),
  timezone text not null default 'Asia/Hong_Kong',
  active boolean not null default true,
  created_at timestamptz default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  cancel_hours int not null default 24 check (cancel_hours in (12, 24, 48)),
  timezone text not null default 'Europe/Berlin',
  -- 64 zufällige Hex-Zeichen (zwei UUIDs v4 ohne Bindestriche)
  ics_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  admin_email text not null
);

create table public.availability_template (
  id bigint generated always as identity primary key,
  weekday smallint not null check (weekday between 0 and 6),
  start_min int not null,
  end_min int not null,
  check (start_min % 30 = 0 and end_min % 30 = 0 and start_min >= 0 and end_min <= 1440 and start_min < end_min)
);

create table public.availability_override (
  date date primary key,
  windows jsonb not null default '[]'::jsonb check (jsonb_typeof(windows) = 'array')
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_min int not null check (duration_min in (60, 90, 120)),
  series_id uuid,
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'late')),
  price numeric(10, 2) not null,
  paid boolean not null default false,
  created_at timestamptz default now(),
  created_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  -- Doppelbuchung technisch unmöglich
  constraint bookings_no_overlap exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
);

create index bookings_family_idx on public.bookings (family_id, starts_at);
create index bookings_starts_idx on public.bookings (starts_at);
create index bookings_series_idx on public.bookings (series_id) where series_id is not null;

create table public.notifications_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('booked', 'series_booked', 'cancelled', 'series_ended')),
  family_id uuid not null,
  payload jsonb not null,
  created_at timestamptz default now(),
  sent_at timestamptz,
  error text
);

------------------------------------------------------------
-- Trigger
------------------------------------------------------------

-- ends_at immer aus starts_at + duration_min
create function public.set_booking_ends_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_min);
  return new;
end;
$$;

create trigger bookings_set_ends_at
  before insert or update of starts_at, duration_min on public.bookings
  for each row execute function public.set_booking_ends_at();

-- Jeder neue Login bekommt automatisch eine Profilzeile (Rolle 'family')
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------
-- Hilfsfunktion
------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.availability_template enable row level security;
alter table public.availability_override enable row level security;
alter table public.bookings enable row level security;
alter table public.notifications_outbox enable row level security;

-- profiles: Familie liest nur sich selbst, schreibt nichts. Admin: alles.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- settings, Zeiten: nur Admin
create policy settings_admin on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy template_admin on public.availability_template for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy override_admin on public.availability_override for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- bookings: Familie liest nur eigene, schreibt nur über RPC-Funktionen. Admin: alles.
create policy bookings_select on public.bookings for select to authenticated
  using (family_id = auth.uid() or public.is_admin());
create policy bookings_admin_write on public.bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- outbox: Admin nur lesen
create policy outbox_admin_read on public.notifications_outbox for select to authenticated
  using (public.is_admin());

-- Nicht angemeldete Besucher bekommen gar nichts
revoke all on public.profiles, public.settings, public.availability_template,
  public.availability_override, public.bookings, public.notifications_outbox from anon;
