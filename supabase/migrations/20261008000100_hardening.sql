-- Hinweise aus "supabase db advisors"

-- Trigger-Funktionen sind nicht für direkte Aufrufe gedacht
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_booking_ends_at() from public, anon, authenticated;

-- auth.uid() einmal pro Abfrage statt pro Zeile auswerten,
-- und Admin-Schreibrechte getrennt, damit es pro Aktion nur eine Lese-Regel gibt.

drop policy profiles_select on public.profiles;
drop policy profiles_admin_write on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_admin_insert on public.profiles for insert to authenticated
  with check ((select public.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using ((select public.is_admin()));

drop policy bookings_select on public.bookings;
drop policy bookings_admin_write on public.bookings;
create policy bookings_select on public.bookings for select to authenticated
  using (family_id = (select auth.uid()) or (select public.is_admin()));
create policy bookings_admin_insert on public.bookings for insert to authenticated
  with check ((select public.is_admin()));
create policy bookings_admin_update on public.bookings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bookings_admin_delete on public.bookings for delete to authenticated
  using ((select public.is_admin()));
