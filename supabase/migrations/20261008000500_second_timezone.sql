-- Second time zone shown next to the admin's own times (families are in Hong Kong)
alter table public.settings add column second_timezone text not null default 'Asia/Hong_Kong';
