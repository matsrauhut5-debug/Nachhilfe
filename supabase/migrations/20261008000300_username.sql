-- Optional username so families can sign in without typing their email.
-- Stored lowercase; the username-login Edge Function maps it to the email server-side.

alter table public.profiles
  add column username text
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

create unique index profiles_username_key on public.profiles (username);
