-- Mats doesn't need the parent's name; remove it completely
alter table public.profiles drop column parent_name;
