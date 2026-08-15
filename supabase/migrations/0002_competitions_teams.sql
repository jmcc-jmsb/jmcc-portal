-- Competitions, disciplines, teams, and the membership tables the case and
-- feedback policies will scope against in later phases.

create table disciplines (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_fr text not null,
  sort_order int
);

create table competitions (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_fr text not null,
  season_year int not null,
  starts_on date,
  ends_on date,
  location text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed', 'archived'))
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions on delete cascade,
  discipline_id uuid references disciplines,
  name text not null
);

-- No is_team_lead. The brief resolved submission to any team member, so a lead
-- column would be a permission that nothing reads and someone eventually trusts.
create table team_members (
  team_id uuid references teams on delete cascade,
  user_id uuid references profiles on delete cascade,
  primary key (team_id, user_id)
);

create table team_coaches (
  team_id uuid references teams on delete cascade,
  coach_id uuid references profiles on delete cascade,
  primary key (team_id, coach_id)
);

create index teams_competition_id_idx on teams (competition_id);
create index team_members_user_id_idx on team_members (user_id);
create index team_coaches_coach_id_idx on team_coaches (coach_id);


-- ── Membership helpers ───────────────────────────────────────────────────────
-- Same definer/stable/search_path reasoning as 0001. These two are the spine of
-- every "only their teams" policy in phases 2 through 5.

create or replace function my_team_ids(uid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from team_members where user_id = uid;
$$;

create or replace function my_coached_team_ids(uid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from team_coaches where coach_id = uid;
$$;

-- Every delegate a coach is responsible for, via the teams they coach. Used by
-- the profiles policy below and, later, by feedback_notes and cabinet_awards.
create or replace function my_coached_user_ids(uid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.user_id
  from team_members tm
  where tm.team_id in (select team_id from team_coaches where coach_id = uid);
$$;


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table disciplines enable row level security;
alter table competitions enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_coaches enable row level security;

-- RLS on lookups too. Disciplines and competitions are not secret, but "not
-- secret" is a judgement that changes, and a table with RLS off is invisible in
-- the audit that HANDOFF §10 asks for.
create policy disciplines_read on disciplines
  for select to authenticated using (true);

create policy disciplines_write on disciplines
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

create policy competitions_read on competitions
  for select to authenticated using (true);

create policy competitions_write on competitions
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- A delegate sees the teams they are on; a coach sees the teams they coach.
create policy teams_read on teams
  for select
  using (
    is_exec(auth.uid())
    or id in (select my_team_ids(auth.uid()))
    or id in (select my_coached_team_ids(auth.uid()))
  );

create policy teams_write on teams
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- Teammates are visible to each other — a roster is the point of a team.
create policy team_members_read on team_members
  for select
  using (
    is_exec(auth.uid())
    or team_id in (select my_team_ids(auth.uid()))
    or team_id in (select my_coached_team_ids(auth.uid()))
  );

create policy team_members_write on team_members
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

create policy team_coaches_read on team_coaches
  for select
  using (
    is_exec(auth.uid())
    or team_id in (select my_team_ids(auth.uid()))
    or coach_id = auth.uid()
  );

create policy team_coaches_write on team_coaches
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));


-- ── Profiles, revisited ──────────────────────────────────────────────────────
-- 0001 could not express "a coach sees their delegates" because the teams tables
-- did not exist yet. Replacing the policy in a new migration is the forward-only
-- way to do this; editing 0001 is not.
drop policy profiles_read on profiles;

create policy profiles_read on profiles
  for select
  using (
    id = auth.uid()
    or is_exec(auth.uid())
    or id in (select my_coached_user_ids(auth.uid()))
    -- Teammates see each other, so a team roster can render names.
    or exists (
      select 1
      from team_members mine
      join team_members theirs on theirs.team_id = mine.team_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
