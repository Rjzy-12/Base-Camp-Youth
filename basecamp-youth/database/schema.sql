-- =====================================================================
-- Official Youth Information E-Governance Platform - Barangay Base Camp
-- Run this whole file once in Supabase: SQL Editor > New query > Run
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- TABLES ----------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 200),
  body text not null check (length(body) between 3 and 5000),
  category text not null default 'General',
  pinned boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 200),
  description text,
  location text,
  event_date date not null,
  start_time time,
  end_time time,
  slots int check (slots is null or slots > 0),   -- null = unlimited
  created_at timestamptz not null default now()
);

create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  full_name text not null check (length(full_name) between 2 and 120),
  age int check (age between 5 and 120),
  purok text check (length(purok) <= 60),
  contact text check (length(contact) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists document_requests (
  id uuid primary key default gen_random_uuid(),
  tracking_code text unique not null,
  full_name text not null check (length(full_name) between 2 and 120),
  age int check (age between 5 and 120),
  purok text check (length(purok) <= 60),
  contact text check (length(contact) <= 60),
  doc_type text not null,
  purpose text check (length(purpose) <= 1000),
  status text not null default 'Pending'
    check (status in ('Pending','Processing','Ready for pickup','Released','Rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  full_name text check (length(full_name) <= 120),
  contact text check (length(contact) <= 60),
  kind text not null default 'Feedback' check (kind in ('Feedback','Inquiry','Suggestion')),
  message text not null check (length(message) between 3 and 3000),
  status text not null default 'New' check (status in ('New','Read','Resolved')),
  created_at timestamptz not null default now()
);

-- ---------- HELPER FUNCTIONS ----------
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function gen_tracking_code() returns text
language plpgsql as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text := 'BC-'; i int;
begin
  for i in 1..6 loop
    code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return code;
end $$;

-- Residents submit a request and get back a tracking code (no login needed)
create or replace function submit_request(
  p_full_name text, p_age int, p_purok text, p_contact text,
  p_doc_type text, p_purpose text
) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  loop
    code := gen_tracking_code();
    exit when not exists (select 1 from document_requests where tracking_code = code);
  end loop;
  insert into document_requests (tracking_code, full_name, age, purok, contact, doc_type, purpose)
  values (code, trim(p_full_name), p_age, trim(p_purok), trim(p_contact), p_doc_type, trim(p_purpose));
  return code;
end $$;

-- Residents check the status of their request using only the tracking code
create or replace function track_request(p_code text)
returns table (tracking_code text, doc_type text, status text, admin_note text,
               created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select r.tracking_code, r.doc_type, r.status, r.admin_note, r.created_at, r.updated_at
  from document_requests r
  where r.tracking_code = upper(trim(p_code));
$$;

-- Public can see how many people registered per event (not who)
create or replace function event_counts()
returns table (evt_id uuid, registered bigint)
language sql security definer stable set search_path = public as $$
  select event_id, count(*) from event_registrations group by event_id;
$$;

-- Block registrations when an event is full
create or replace function check_event_slots() returns trigger
language plpgsql security definer set search_path = public as $$
declare max_slots int; taken int;
begin
  select slots into max_slots from events where id = new.event_id;
  if max_slots is not null then
    select count(*) into taken from event_registrations where event_id = new.event_id;
    if taken >= max_slots then
      raise exception 'This event is already full.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_check_event_slots on event_registrations;
create trigger trg_check_event_slots before insert on event_registrations
for each row execute function check_event_slots();

-- ---------- ROW LEVEL SECURITY ----------
alter table admins              enable row level security;
alter table announcements       enable row level security;
alter table events              enable row level security;
alter table event_registrations enable row level security;
alter table document_requests   enable row level security;
alter table feedback            enable row level security;

drop policy if exists "admins read self"   on admins;
drop policy if exists "ann public read"    on announcements;
drop policy if exists "ann admin all"      on announcements;
drop policy if exists "events public read" on events;
drop policy if exists "events admin all"   on events;
drop policy if exists "reg public insert"  on event_registrations;
drop policy if exists "reg admin all"      on event_registrations;
drop policy if exists "req admin all"      on document_requests;
drop policy if exists "fb public insert"   on feedback;
drop policy if exists "fb admin all"       on feedback;

create policy "admins read self"   on admins for select to authenticated using (user_id = auth.uid());

create policy "ann public read"    on announcements for select to anon, authenticated using (published or is_admin());
create policy "ann admin all"      on announcements for all to authenticated using (is_admin()) with check (is_admin());

create policy "events public read" on events for select to anon, authenticated using (true);
create policy "events admin all"   on events for all to authenticated using (is_admin()) with check (is_admin());

create policy "reg public insert"  on event_registrations for insert to anon, authenticated with check (true);
create policy "reg admin all"      on event_registrations for all to authenticated using (is_admin()) with check (is_admin());

-- document_requests: NO public access; residents use submit_request() / track_request()
create policy "req admin all"      on document_requests for all to authenticated using (is_admin()) with check (is_admin());

create policy "fb public insert"   on feedback for insert to anon, authenticated with check (true);
create policy "fb admin all"       on feedback for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- SAMPLE DATA (delete later from the admin page) ----------
insert into announcements (title, body, category, pinned) values
('Welcome to the Base Camp Youth Platform',
 'This is the official online space for youth announcements, events, and document requests in Barangay Base Camp. Check here first for updates from the Barangay and the SK.',
 'General', true),
('SK General Assembly',
 'All youth residents ages 15 to 30 are invited to the SK General Assembly. Bring a valid ID or school ID.',
 'Youth Program', false);

insert into events (title, description, location, event_date, start_time, slots) values
('Barangay Sports Fest', 'Basketball, volleyball, and track events for all puroks.', 'Base Camp Covered Court', current_date + 14, '08:00', 100),
('Youth Leadership Seminar', 'A half-day seminar on youth participation in local governance.', 'Barangay Hall', current_date + 21, '13:00', 50);
