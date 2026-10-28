-- =====================================================================
-- UPDATE 1: Youth profiling registry + live updates
-- Run once in Supabase: SQL Editor > New query > paste > Run
-- (Safe to run more than once.)
-- =====================================================================

create table if not exists youth_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 120),
  birthdate date not null,
  sex text not null check (sex in ('Male','Female')),
  purok text not null check (length(purok) between 1 and 60),
  contact text check (length(contact) <= 60),
  email text check (length(email) <= 120),
  status text not null check (status in ('Student','Employed','Out of School Youth','Other')),
  school_or_work text check (length(school_or_work) <= 160),
  sk_member boolean not null default false,
  approval text not null default 'Pending' check (approval in ('Pending','Approved','Rejected')),
  created_at timestamptz not null default now()
);

-- Same person (name + birthdate) cannot be registered twice
create unique index if not exists youth_profiles_unique
  on youth_profiles (lower(trim(full_name)), birthdate);

alter table youth_profiles enable row level security;
drop policy if exists "youth public insert" on youth_profiles;
drop policy if exists "youth admin all"     on youth_profiles;

-- The public can ONLY submit a profile as 'Pending'. They can never read the registry.
create policy "youth public insert" on youth_profiles for insert to anon, authenticated
  with check (approval = 'Pending');
create policy "youth admin all" on youth_profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- Live updates for announcements and events
do $$
begin
  begin alter publication supabase_realtime add table announcements; exception when others then null; end;
  begin alter publication supabase_realtime add table events;        exception when others then null; end;
end $$;
