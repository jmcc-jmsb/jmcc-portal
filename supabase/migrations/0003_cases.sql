-- The vault: cases, their embargoed materials, team submissions, and the audit
-- trail. HANDOFF §4 calls these "the security-critical tables" and it is right —
-- everything here is one policy away from leaking a case before release.

create table cases (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions on delete cascade,
  discipline_id uuid references disciplines,
  title text not null,
  description text,
  deliverable_format text,

  release_at            timestamptz not null,
  submission_opens_at   timestamptz not null,
  submission_closes_at  timestamptz not null,

  coach_visibility text not null default 'same'
    check (coach_visibility in ('same', 'early', 'after')),
  coach_release_at timestamptz,

  audience_type text not null default 'competition'
    check (audience_type in ('competition', 'discipline', 'teams')),
  audience_team_ids uuid[],

  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'closed')),
  force_released_at timestamptz,
  created_by uuid references profiles,
  created_at timestamptz not null default now(),

  constraint valid_window check (submission_closes_at > submission_opens_at
                                 and submission_opens_at >= release_at),
  constraint coach_early_needs_time check (
    coach_visibility <> 'early' or coach_release_at is not null),
  -- audience_type 'teams' with no teams is a case nobody can see. The form
  -- cannot produce it; the constraint means nothing else can either.
  constraint teams_audience_needs_teams check (
    audience_type <> 'teams' or coalesce(array_length(audience_team_ids, 1), 0) > 0)
);

create table case_materials (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  filename text not null,
  storage_path text not null,          -- private bucket
  kind text not null check (kind in ('case', 'exhibit', 'data', 'rubric')),
  size_bytes bigint,
  sort_order int
);

create table case_submissions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  team_id uuid not null references teams on delete cascade,
  submitted_by uuid not null references profiles,
  version int not null,
  files jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (case_id, team_id, version)
);

-- HANDOFF §4: written from server endpoints for role changes, case release and
-- force-release, deadline extensions, submissions, and award grants. Phase 2
-- writes the case rows; later phases add their own actions.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index cases_competition_id_idx on cases (competition_id);
create index case_materials_case_id_idx on case_materials (case_id);
create index case_submissions_case_team_idx on case_submissions (case_id, team_id);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);


-- ── Audience resolution ──────────────────────────────────────────────────────
-- One function turns a case's audience into a set of team ids, and everything
-- else asks it. Three call sites deciding separately what 'discipline' means is
-- how a case ends up visible to the wrong room.

create or replace function case_team_ids(c cases)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from teams t
  where case c.audience_type
    when 'teams' then t.id = any (c.audience_team_ids)
    when 'discipline' then t.competition_id = c.competition_id
                        and t.discipline_id is not distinct from c.discipline_id
    else t.competition_id = c.competition_id
  end;
$$;

create or replace function is_coach_of_case(uid uuid, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from cases c
    cross join lateral case_team_ids(c) as ct(team_id)
    where c.id = cid
      and ct.team_id in (select my_coached_team_ids(uid))
  );
$$;

create or replace function case_in_audience(c cases, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_exec(uid)
     or exists (
       select 1
       from case_team_ids(c) as ct(team_id)
       where ct.team_id in (select my_team_ids(uid))
          or ct.team_id in (select my_coached_team_ids(uid))
     );
$$;

-- HANDOFF §4, verbatim in intent: release state is derived here and never
-- computed on the client. A client that believes the vault is open still meets
-- this function on the way to the bytes.
create or replace function case_is_released(c cases, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.force_released_at is not null then true
    when is_exec(viewer) then true
    when is_coach_of_case(viewer, c.id) then
      case c.coach_visibility
        when 'early' then now() >= c.coach_release_at
        when 'after' then now() >= c.submission_closes_at
        else now() >= c.release_at
      end
    else now() >= c.release_at
  end;
$$;


-- The teams in a case's audience, scoped to what the caller may know about:
-- executives see the whole field, a coach sees the teams they coach, a delegate
-- sees their own. This is what the submission monitor counts "outstanding"
-- against — without it the client would have to guess a denominator, and a
-- delegate would learn how many other teams exist.
create or replace function case_roster(cid uuid)
returns table (team_id uuid, team_name text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name
  from cases c
  cross join lateral case_team_ids(c) as ct(team_id)
  join teams t on t.id = ct.team_id
  where c.id = cid
    and (
      is_exec(auth.uid())
      or ct.team_id in (select my_coached_team_ids(auth.uid()))
      or ct.team_id in (select my_team_ids(auth.uid()))
    );
$$;

-- Which team the caller submits as. A delegate on exactly one team in the
-- case's audience gets that team; anyone else gets null and the endpoint stops.
-- Derived rather than accepted from the request, because a team id in a request
-- body is a team id someone can change.
create or replace function my_team_for_case(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ct.team_id
  from cases c
  cross join lateral case_team_ids(c) as ct(team_id)
  where c.id = cid
    and ct.team_id in (select my_team_ids(auth.uid()))
  limit 1;
$$;


-- ── What a delegate may see before release ───────────────────────────────────
-- HANDOFF §6 refuses to return filenames in a pre-release 403, because "a
-- filename leaks the case topic". A title leaks it harder. So the cases row
-- itself is invisible until release (policy below), and the sealed state reads
-- through this function, which returns the scheduling metadata DESIGN_BRIEF §5.7
-- lists for state 1 — competition, discipline, format, timings — and nulls the
-- title and description until the case is genuinely open to this caller.
--
-- Doing the projection in SQL rather than in the endpoint means the redaction
-- cannot be lost by a later refactor of the TypeScript.
create or replace function my_cases()
returns table (
  id uuid,
  competition_id uuid,
  discipline_id uuid,
  title text,
  description text,
  deliverable_format text,
  release_at timestamptz,
  submission_opens_at timestamptz,
  submission_closes_at timestamptz,
  coach_visibility text,
  coach_release_at timestamptz,
  audience_type text,
  status text,
  force_released_at timestamptz,
  released boolean,
  server_now timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.competition_id,
    c.discipline_id,
    case when case_is_released(c, auth.uid()) then c.title end,
    case when case_is_released(c, auth.uid()) then c.description end,
    c.deliverable_format,
    c.release_at,
    c.submission_opens_at,
    c.submission_closes_at,
    c.coach_visibility,
    c.coach_release_at,
    c.audience_type,
    c.status,
    c.force_released_at,
    case_is_released(c, auth.uid()),
    now()
  from cases c
  where case_in_audience(c, auth.uid())
    -- A draft is an executive's working copy. DESIGN_BRIEF §5.7 step 6 puts the
    -- scheduled queue in front of execs only; a scheduled case is what a
    -- delegate sees as sealed.
    and (c.status <> 'draft' or is_exec(auth.uid()));
$$;


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table cases enable row level security;
alter table case_materials enable row level security;
alter table case_submissions enable row level security;
alter table audit_log enable row level security;

-- Strict on purpose. `select * from cases` as a delegate returns zero rows until
-- the case is released to them — which is exactly the check HANDOFF §9 asks for
-- at the end of this phase. The sealed screen goes through my_cases() instead.
create policy cases_read on cases
  for select
  using (case_in_audience(cases, auth.uid()) and case_is_released(cases, auth.uid()));

create policy cases_write on cases
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- HANDOFF §5, policy 2 of the four that carry real risk. Time-gated in the
-- database, not hidden in the client.
create policy materials_read on case_materials
  for select
  using (exists (
    select 1 from cases c
    where c.id = case_materials.case_id
      and case_is_released(c, auth.uid())
      and case_in_audience(c, auth.uid())
  ));

create policy materials_write on case_materials
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- A team sees its own submissions; a coach sees the teams they coach.
create policy submissions_read on case_submissions
  for select
  using (
    is_exec(auth.uid())
    or team_id in (select my_team_ids(auth.uid()))
    or team_id in (select my_coached_team_ids(auth.uid()))
  );

-- Any team member may submit (DESIGN_BRIEF §5.7 state 3), only as themselves,
-- and only while the window is actually open. The endpoint checks all of this
-- first; the policy is what makes the check true rather than merely polite.
create policy submissions_insert on case_submissions
  for insert
  with check (
    submitted_by = auth.uid()
    and team_id in (select my_team_ids(auth.uid()))
    and exists (
      select 1 from cases c
      where c.id = case_submissions.case_id
        and now() >= c.submission_opens_at
        and now() < c.submission_closes_at
    )
  );

-- No update or delete policy, deliberately. A submission is a versioned record
-- of what was handed in at a moment; editing one after the fact would make the
-- version history a story rather than evidence.

-- Exec reads the log. Nobody holding a JWT writes it — the inserts come from
-- server endpoints on the service role, so an actor cannot forge their own
-- trail. RLS is on with no insert policy, which is what enforces that.
create policy audit_read on audit_log
  for select using (is_exec(auth.uid()));


-- ── Storage ──────────────────────────────────────────────────────────────────
-- HANDOFF §5: both private. No storage policies for `authenticated`, because
-- every read is a server-issued signed URL (§6) and every write goes through an
-- endpoint that has already checked the caller. A storage policy here would be a
-- second, quieter way in.
insert into storage.buckets (id, name, public)
values ('case-materials', 'case-materials', false),
       ('case-submissions', 'case-submissions', false)
on conflict (id) do nothing;
