-- =====================================================================
-- UPDATE 2: Event polls (voting) + Suggestion threads with comments
-- Run once in Supabase: SQL Editor > New query > paste > Run
-- (Safe to run more than once. Run AFTER schema.sql and update-1.sql.)
-- =====================================================================

-- ---------- POLLS ----------
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 200),
  description text check (length(description) <= 2000),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  announcement_id uuid references announcements(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null check (length(label) between 2 and 160),
  detail text check (length(detail) <= 500),
  position int not null default 0
);

-- One vote per voter_key per poll. voter_key is a random id stored on the
-- voter's device. Votes can only be cast through cast_vote() below.
create table if not exists poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  voter_key text not null check (length(voter_key) between 8 and 80),
  created_at timestamptz not null default now(),
  unique (poll_id, voter_key)
);

-- ---------- SUGGESTIONS ----------
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 160),
  body text not null check (length(body) between 3 and 2000),
  author_name text check (length(author_name) <= 80),
  status text not null default 'Open' check (status in ('Open','Under review','Planned','Declined')),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists suggestion_comments (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  author_name text check (length(author_name) <= 80),
  body text not null check (length(body) between 1 and 1000),
  hidden boolean not null default false,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists suggestion_likes (
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  voter_key text not null check (length(voter_key) between 8 and 80),
  created_at timestamptz not null default now(),
  primary key (suggestion_id, voter_key)
);

create index if not exists poll_votes_poll_idx on poll_votes (poll_id);
create index if not exists sug_comments_idx on suggestion_comments (suggestion_id, created_at);

-- ---------- FUNCTIONS ----------

-- Close a poll, work out the winner, and post the result announcement.
-- Idempotent: running it on an already closed poll does nothing.
create or replace function finalize_poll(p_id uuid, p_force boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pl polls%rowtype;
  total int;
  top_votes int;
  winners text;
  breakdown text;
  ann_id uuid;
  msg text;
begin
  select * into pl from polls where id = p_id for update;
  if not found or pl.status = 'closed' then return; end if;
  if not p_force and pl.ends_at > now() then return; end if;

  select count(*) into total from poll_votes where poll_id = p_id;

  select coalesce(string_agg(
           o.label || ': ' || coalesce(v.c, 0) || ' vote' || case when coalesce(v.c,0) = 1 then '' else 's' end ||
           ' (' || case when total = 0 then 0 else round(coalesce(v.c,0) * 100.0 / total) end || '%)',
           E'\n' order by coalesce(v.c,0) desc, o.position), '')
    into breakdown
  from poll_options o
  left join (select option_id, count(*) c from poll_votes where poll_id = p_id group by option_id) v on v.option_id = o.id
  where o.poll_id = p_id;

  if total = 0 then
    msg := 'Voting for "' || pl.title || '" has ended, but no votes were cast. The SK will decide on the next steps.';
  else
    select max(c) into top_votes from (select count(*) c from poll_votes where poll_id = p_id group by option_id) x;
    select string_agg(o.label, ' and ' order by o.position) into winners
    from poll_options o
    join (select option_id from poll_votes where poll_id = p_id group by option_id having count(*) = top_votes) w on w.option_id = o.id
    where o.poll_id = p_id;
    msg := case when position(' and ' in winners) > 0
              then 'It is a tie! The top choices are ' || winners || ', with ' || top_votes || ' votes each.'
              else 'The youth have spoken! "' || winners || '" won the vote with ' || top_votes || ' of ' || total || ' votes (' || round(top_votes * 100.0 / total) || '%).' end
         || E'\n\nFull results (' || total || ' total votes):\n' || breakdown
         || E'\n\nThank you to everyone who voted. Watch the Events page for the official schedule and registration.';
  end if;

  insert into announcements (title, body, category, pinned, published)
  values ('Poll results: ' || pl.title, msg, 'Poll Results', true, true)
  returning id into ann_id;

  update polls set status = 'closed', closed_at = now(), announcement_id = ann_id where id = p_id;
end $$;

-- Close every poll whose time is up. Called by the website on page load
-- (and optionally by pg_cron, see the bottom of this file).
create or replace function finalize_due_polls() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from polls where status = 'open' and ends_at <= now() loop
    perform finalize_poll(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Staff: end a poll right now
create or replace function close_poll_now(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  perform finalize_poll(p_id, true);
end $$;

-- Voters: cast one vote (one per device per poll)
create or replace function cast_vote(p_poll uuid, p_option uuid, p_key text) returns text
language plpgsql security definer set search_path = public as $$
declare pl polls%rowtype;
begin
  select * into pl from polls where id = p_poll;
  if not found then raise exception 'Poll not found'; end if;
  if pl.status <> 'open' or pl.ends_at <= now() then raise exception 'Voting has ended'; end if;
  if not exists (select 1 from poll_options where id = p_option and poll_id = p_poll) then
    raise exception 'Invalid choice';
  end if;
  insert into poll_votes (poll_id, option_id, voter_key) values (p_poll, p_option, p_key);
  return 'ok';
exception when unique_violation then
  raise exception 'You already voted in this poll';
end $$;

-- Public: results. Hidden while a poll is open (staff can always see them).
create or replace function poll_results(p_poll uuid)
returns table (option_id uuid, votes bigint)
language sql security definer stable set search_path = public as $$
  select o.id, count(v.id)
  from poll_options o
  left join poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll
    and (is_admin() or exists (select 1 from polls where id = p_poll and status = 'closed'))
  group by o.id;
$$;

-- Public: how many people voted (no results), and which option THIS device picked
create or replace function poll_turnout(p_poll uuid) returns bigint
language sql security definer stable set search_path = public as $$
  select count(*) from poll_votes where poll_id = p_poll;
$$;

create or replace function my_vote(p_poll uuid, p_key text) returns uuid
language sql security definer stable set search_path = public as $$
  select option_id from poll_votes where poll_id = p_poll and voter_key = p_key;
$$;

-- Suggestion likes
create or replace function toggle_like(p_sug uuid, p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from suggestion_likes where suggestion_id = p_sug and voter_key = p_key) then
    delete from suggestion_likes where suggestion_id = p_sug and voter_key = p_key;
    return false;
  end if;
  insert into suggestion_likes (suggestion_id, voter_key) values (p_sug, p_key);
  return true;
end $$;

create or replace function suggestion_like_counts()
returns table (sug_id uuid, likes bigint)
language sql security definer stable set search_path = public as $$
  select suggestion_id, count(*) from suggestion_likes group by suggestion_id;
$$;

create or replace function my_likes(p_key text) returns setof uuid
language sql security definer stable set search_path = public as $$
  select suggestion_id from suggestion_likes where voter_key = p_key;
$$;

-- ---------- ROW LEVEL SECURITY ----------
alter table polls               enable row level security;
alter table poll_options        enable row level security;
alter table poll_votes          enable row level security;
alter table suggestions         enable row level security;
alter table suggestion_comments enable row level security;
alter table suggestion_likes    enable row level security;

drop policy if exists "polls public read"   on polls;
drop policy if exists "polls admin all"     on polls;
drop policy if exists "opts public read"    on poll_options;
drop policy if exists "opts admin all"      on poll_options;
drop policy if exists "votes admin read"    on poll_votes;
drop policy if exists "sug public read"     on suggestions;
drop policy if exists "sug public insert"   on suggestions;
drop policy if exists "sug admin all"       on suggestions;
drop policy if exists "scom public read"    on suggestion_comments;
drop policy if exists "scom public insert"  on suggestion_comments;
drop policy if exists "scom admin all"      on suggestion_comments;

create policy "polls public read" on polls for select to anon, authenticated using (true);
create policy "polls admin all"   on polls for all to authenticated using (is_admin()) with check (is_admin());
create policy "opts public read"  on poll_options for select to anon, authenticated using (true);
create policy "opts admin all"    on poll_options for all to authenticated using (is_admin()) with check (is_admin());

-- Votes and likes: NO direct public access. Only cast_vote() / toggle_like().
create policy "votes admin read"  on poll_votes for select to authenticated using (is_admin());

create policy "sug public read"   on suggestions for select to anon, authenticated using (not hidden or is_admin());
create policy "sug public insert" on suggestions for insert to anon, authenticated
  with check (status = 'Open' and hidden = false);
create policy "sug admin all"     on suggestions for all to authenticated using (is_admin()) with check (is_admin());

create policy "scom public read"  on suggestion_comments for select to anon, authenticated using (not hidden or is_admin());
create policy "scom public insert" on suggestion_comments for insert to anon, authenticated
  with check (hidden = false and is_staff = false);
create policy "scom admin all"    on suggestion_comments for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- LIVE UPDATES ----------
do $$
begin
  begin alter publication supabase_realtime add table polls;               exception when others then null; end;
  begin alter publication supabase_realtime add table suggestions;         exception when others then null; end;
  begin alter publication supabase_realtime add table suggestion_comments; exception when others then null; end;
end $$;

-- ---------- OPTIONAL: close polls on time even if nobody opens the website ----------
-- Supabase > Database > Extensions > enable "pg_cron", then run this line once:
--   select cron.schedule('close-due-polls', '* * * * *', $$select finalize_due_polls()$$);
-- Without pg_cron it still works: the poll closes and the announcement is posted
-- the first time anyone opens the site after the deadline.
