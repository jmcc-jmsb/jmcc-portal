-- Phase 3: the cabinet a delegate comes back for, the tasks they owe, and the
-- calendar those tasks hang off.

-- ── Cabinet ──────────────────────────────────────────────────────────────────
-- The catalog is piece *types*. What binds a piece to a competition or a year is
-- an award, which is the next table down.
--
-- is_repeatable is the column PHASE_0_NOTES §2 argued for and the exec approved.
-- Without it, "1st · JDCC" and "1st · JMUCC" are two catalog rows, adding a
-- competition means adding rows, and the "N of 26" denominator climbs every
-- September — so a returning delegate's cabinet reads emptier the longer they
-- stay, which inverts the one mechanic this screen exists for.
create table cabinet_pieces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_fr text not null,
  category text not null check (category in ('placement', 'season', 'milestone', 'commendation')),
  description_en text,
  description_fr text,
  -- What earns it. DESIGN_BRIEF §5.8: empty plinths are labeled, and roughly a
  -- handful are left as unlabeled silhouettes — those are the secret ones.
  unlock_hint_en text,
  unlock_hint_fr text,
  is_secret boolean not null default false,
  is_repeatable boolean not null default false,
  tone text not null default 'sand' check (tone in ('gold', 'sand')),
  shape text not null default 'disc' check (shape in ('disc', 'diamond', 'bar')),
  sort_order int
);

create table cabinet_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  piece_id uuid not null references cabinet_pieces on delete cascade,
  competition_id uuid references competitions on delete set null,
  team_id uuid references teams on delete set null,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references profiles,
  note text,
  -- A non-repeatable piece is held once. The partial index lets a repeatable
  -- piece be granted many times while still refusing an accidental duplicate of
  -- the same piece for the same competition.
  unique (user_id, piece_id, competition_id)
);

create index cabinet_awards_user_idx on cabinet_awards (user_id);


-- ── Tasks ────────────────────────────────────────────────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  source text not null default 'self' check (source in ('auto', 'exec', 'coach', 'self')),
  created_by uuid references profiles,
  -- Group assignment inserts N rows sharing a batch_id, so "unassign that thing
  -- I sent to forty people" stays one operation.
  batch_id uuid,
  linked_type text check (linked_type in ('case', 'event', 'document')),
  linked_id uuid,
  -- The export's `locked: true` on the auto-generated signing task. A system
  -- task can be completed but never deleted — this is what keeps a waiver from
  -- vanishing because someone tidied their list.
  is_system boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index tasks_owner_idx on tasks (owner_id, completed_at);
create index tasks_batch_idx on tasks (batch_id);


-- ── Events ───────────────────────────────────────────────────────────────────
create table events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions on delete cascade,
  title_en text not null,
  title_fr text,
  description text,
  type text not null default 'admin'
    check (type in ('competition', 'practice', 'deadline', 'social', 'admin')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  location_url text,
  audience_type text not null default 'everyone'
    check (audience_type in ('everyone', 'competition', 'team', 'role')),
  audience_ref text,
  created_by uuid references profiles,
  created_at timestamptz not null default now(),
  -- A deadline is a point, not a duration (DESIGN_BRIEF §5.2), so it is the one
  -- type that may not carry an end.
  constraint deadline_has_no_end check (type <> 'deadline' or ends_at is null),
  constraint ends_after_starts check (ends_at is null or ends_at > starts_at)
);

create index events_starts_idx on events (starts_at);

create table event_rsvps (
  event_id uuid references events on delete cascade,
  user_id uuid references profiles on delete cascade,
  status text not null default 'going' check (status in ('going', 'maybe', 'declined')),
  responded_at timestamptz not null default now(),
  primary key (event_id, user_id)
);


-- ── Audience helper ──────────────────────────────────────────────────────────
-- Events scope more loosely than cases: most of what JMCC schedules is for
-- everyone, and the ones that are not are scoped to a competition or a team.
create or replace function event_in_audience(e events, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case e.audience_type
    when 'everyone' then true
    when 'competition' then is_exec(uid) or exists (
      select 1 from teams t
      where t.competition_id = e.competition_id
        and (t.id in (select my_team_ids(uid)) or t.id in (select my_coached_team_ids(uid)))
    )
    when 'team' then is_exec(uid)
      or e.audience_ref::uuid in (select my_team_ids(uid))
      or e.audience_ref::uuid in (select my_coached_team_ids(uid))
    when 'role' then is_exec(uid) or has_role(uid, e.audience_ref::app_role)
    else false
  end;
$$;


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table cabinet_pieces enable row level security;
alter table cabinet_awards enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table event_rsvps enable row level security;

-- The catalog is not a secret. A delegate needs every piece — including the ones
-- they have not earned — to render the empty plinths, which are the point of the
-- screen. Secret pieces are hidden here rather than in the client, so a delegate
-- reading the API sees the same silhouettes the UI draws.
create policy pieces_read on cabinet_pieces
  for select to authenticated
  using (
    not is_secret
    or is_exec(auth.uid())
    or exists (
      select 1 from cabinet_awards a
      where a.piece_id = cabinet_pieces.id and a.user_id = auth.uid()
    )
  );

create policy pieces_write on cabinet_pieces
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- DESIGN_BRIEF §5.8: "Coaches and executives can view a delegate's cabinet;
-- delegates see only their own." No leaderboard, no peer comparison — the brief
-- calls comparison a demotivator, so the policy makes it unavailable rather than
-- leaving it to the UI to decline to build.
create policy awards_read on cabinet_awards
  for select
  using (
    user_id = auth.uid()
    or is_exec(auth.uid())
    or user_id in (select my_coached_user_ids(auth.uid()))
  );

create policy awards_write on cabinet_awards
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- A task is personal. A coach sees their delegates', an exec sees everyone's.
create policy tasks_read on tasks
  for select
  using (
    owner_id = auth.uid()
    or is_exec(auth.uid())
    or owner_id in (select my_coached_user_ids(auth.uid()))
  );

-- You may give yourself a task; an exec may give one to anyone; a coach may give
-- one to their own delegates. `is_system` is refused to everyone holding a JWT —
-- those come from server endpoints on the secret key, so a delegate cannot mint
-- an undeletable task for someone else.
create policy tasks_insert on tasks
  for insert
  with check (
    not is_system
    and (
      (owner_id = auth.uid() and source = 'self')
      or is_exec(auth.uid())
      or (owner_id in (select my_coached_user_ids(auth.uid())) and has_role(auth.uid(), 'coach'))
    )
  );

create policy tasks_update on tasks
  for update
  using (owner_id = auth.uid() or is_exec(auth.uid()))
  with check (owner_id = auth.uid() or is_exec(auth.uid()));

-- The whole point of is_system. Completing it is an update, which is allowed
-- above; removing it is not, for anyone.
create policy tasks_delete on tasks
  for delete
  using (not is_system and (owner_id = auth.uid() or is_exec(auth.uid())));

create policy events_read on events
  for select using (event_in_audience(events, auth.uid()));

create policy events_write on events
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

create policy rsvps_read on event_rsvps
  for select using (user_id = auth.uid() or is_exec(auth.uid()));

create policy rsvps_write on event_rsvps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ── The cabinet, as one delegate sees it ─────────────────────────────────────
/**
 * Every piece the viewer may see, with whether they have earned it and how many
 * times.
 *
 * The count is what makes is_repeatable work without a growing denominator: a
 * repeatable piece is one plinth that reads "×3", not three plinths. The
 * headline stays "N of M pieces" with M stable across a delegate's whole career,
 * which is the behaviour PHASE_0_NOTES §2 was protecting.
 *
 * Takes a target so a coach or an exec can open a delegate's cabinet; defaults
 * to the caller. The awards_read policy still decides — asking for someone
 * else's returns their pieces with every earned flag false, never their awards.
 */
create or replace function cabinet_for(target uuid default null)
returns table (
  piece_id uuid,
  code text,
  name_en text,
  name_fr text,
  category text,
  unlock_hint_en text,
  unlock_hint_fr text,
  is_secret boolean,
  is_repeatable boolean,
  tone text,
  shape text,
  sort_order int,
  earned_count int,
  first_awarded_at timestamptz,
  last_awarded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (select coalesce(target, auth.uid()) as uid),
  -- Re-checks the same relationships awards_read expresses. A definer function
  -- bypasses RLS, so this is not decoration: without it, passing any uuid would
  -- read that person's cabinet.
  allowed as (
    select (select uid from viewer) as uid
    where (select uid from viewer) = auth.uid()
       or is_exec(auth.uid())
       or (select uid from viewer) in (select my_coached_user_ids(auth.uid()))
  ),
  mine as (
    select a.piece_id, count(*)::int as n, min(a.awarded_at) as first_at, max(a.awarded_at) as last_at
    from cabinet_awards a
    join allowed on a.user_id = allowed.uid
    group by a.piece_id
  )
  select
    p.id, p.code, p.name_en, p.name_fr, p.category,
    p.unlock_hint_en, p.unlock_hint_fr, p.is_secret, p.is_repeatable,
    p.tone, p.shape, p.sort_order,
    coalesce(m.n, 0), m.first_at, m.last_at
  from cabinet_pieces p
  left join mine m on m.piece_id = p.id
  -- A secret piece stays a silhouette until it is earned, and disappears
  -- entirely from a cabinet that has not earned it — DESIGN_BRIEF §5.8 wants
  -- "enough mystery to be interesting", not a labelled list of what is hidden.
  where not p.is_secret or coalesce(m.n, 0) > 0
  order by
    case p.category
      when 'placement' then 1 when 'season' then 2
      when 'milestone' then 3 else 4 end,
    p.sort_order nulls last;
$$;
