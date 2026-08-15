-- Phase 5: channels, membership, messages. Slack-lite and deliberately limited
-- (DESIGN_BRIEF §5.5).

create table channels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('announcement', 'competition', 'team', 'group', 'dm')),
  name text,
  competition_id uuid references competitions on delete cascade,
  team_id uuid references teams on delete cascade,
  created_by uuid references profiles,
  -- Announcement channels are exec-posted; delegates read them and, when asked,
  -- acknowledge them. There is no composer for a delegate in one.
  is_readonly boolean not null default false,
  pinned_message_id uuid,
  created_at timestamptz not null default now(),

  -- A DM has no name and gets one from whoever you are talking to; everything
  -- else needs one, or the channel list is a column of blanks.
  constraint named_unless_dm check (type = 'dm' or name is not null)
);

create table channel_members (
  channel_id uuid references channels on delete cascade,
  user_id uuid references profiles on delete cascade,
  -- Unread is a count derived from this, not a stored counter that drifts.
  last_read_at timestamptz not null default '-infinity',
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels on delete cascade,
  author_id uuid not null references profiles on delete cascade,
  body text not null,
  attachment_path text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- "Optional acknowledge button so execs can confirm a message landed" (§5.5).
create table message_acks (
  message_id uuid references messages on delete cascade,
  user_id uuid references profiles on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table channels
  add constraint channels_pinned_fk
  foreign key (pinned_message_id) references messages on delete set null;

create index channel_members_user_idx on channel_members (user_id);
create index messages_channel_idx on messages (channel_id, created_at desc);


-- ── Membership helpers ───────────────────────────────────────────────────────
-- The spine of every policy below. A definer function so the messages policy can
-- ask "is this caller in this channel" without re-entering channel_members' own
-- policy.
create or replace function is_channel_member(uid uuid, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from channel_members m where m.channel_id = cid and m.user_id = uid
  );
$$;

/**
 * Who may open a direct message with whom.
 *
 * DESIGN_BRIEF §5.5: "Delegates cannot DM executives outside a channel — route
 * that through announcements or a team channel so it stays visible and doesn't
 * turn one exec into an unlogged help desk."
 *
 * So the refusal is specifically delegate → executive. Coaches are on the staff
 * side of this and may DM either way; two executives may talk to each other.
 * Written as a rule in the database rather than a missing button, because the
 * missing button is the version that stops working the moment someone learns the
 * API.
 */
create or replace function may_dm(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a <> b and not (
    (is_exec(a) and not (is_exec(b) or has_role(b, 'coach')))
    or
    (is_exec(b) and not (is_exec(a) or has_role(a, 'coach')))
  );
$$;


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table message_acks enable row level security;

-- You see the channels you are in. An executive sees announcement and
-- competition channels without being a member, because they administer them —
-- but not team channels, group chats or DMs they were not added to. An exec
-- reading every group chat by default is a different product.
create policy channels_read on channels
  for select
  using (
    is_channel_member(auth.uid(), id)
    or (is_exec(auth.uid()) and type in ('announcement', 'competition'))
  );

/* Split per command rather than written as FOR ALL, and that is not style.
   A FOR ALL policy's `using` clause also applies to SELECT, and policies are
   OR'd — so `for all using (is_exec(...))` would have quietly granted every
   executive read access to every group chat and direct message in the system,
   straight past the read policy above. Caught by the test that asserts an exec
   does not see team channels they are not in. */
create policy channels_insert on channels
  for insert with check (is_exec(auth.uid()));

create policy channels_update on channels
  for update
  using (is_exec(auth.uid()) or is_channel_member(auth.uid(), id))
  with check (is_exec(auth.uid()) or is_channel_member(auth.uid(), id));

create policy channels_delete on channels
  for delete using (is_exec(auth.uid()));

create policy members_read on channel_members
  for select using (is_channel_member(auth.uid(), channel_id));

-- You may update your own row — that is what marking a channel read is — and
-- leave a channel. Adding people is done through the functions below, which
-- enforce the rules a bare insert policy cannot express.
create policy members_update_own on channel_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy members_leave on channel_members
  for delete using (user_id = auth.uid() or is_exec(auth.uid()));

create policy members_write_exec on channel_members
  for insert with check (is_exec(auth.uid()));

/**
 * HANDOFF §5, policy 4. Read requires a channel_members row; insert
 * additionally requires the channel not be read-only, or the caller be an exec.
 */
create policy messages_read on messages
  for select using (is_channel_member(auth.uid(), channel_id));

create policy messages_insert on messages
  for insert
  with check (
    author_id = auth.uid()
    and is_channel_member(auth.uid(), channel_id)
    and (
      is_exec(auth.uid())
      or not exists (select 1 from channels c where c.id = channel_id and c.is_readonly)
    )
  );

-- Edit and delete your own words. Nobody edits somebody else's, exec included:
-- a channel where a message can change after it was read is not a record.
create policy messages_update_own on messages
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy messages_delete on messages
  for delete using (author_id = auth.uid() or is_exec(auth.uid()));

create policy acks_read on message_acks
  for select
  using (
    user_id = auth.uid()
    or is_exec(auth.uid())
    or exists (select 1 from messages m where m.id = message_id and m.author_id = auth.uid())
  );

create policy acks_write on message_acks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ── Creating conversations ───────────────────────────────────────────────────
/**
 * Open (or reuse) a direct message channel with someone.
 *
 * Definer, because creating a DM means writing two channel_members rows —
 * including the other person's, which no insert policy should ever allow a
 * delegate to do in general. The rules live here instead: may_dm() decides, and
 * an existing DM between the same two people is returned rather than duplicated.
 */
create or replace function open_dm(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  fresh uuid;
begin
  if me is null or other is null then
    raise exception 'unauthenticated';
  end if;
  if not may_dm(me, other) then
    raise exception 'not permitted to open a direct message with this person'
      using errcode = 'insufficient_privilege';
  end if;

  -- Exactly the two of us, and no third member.
  select c.id into existing
  from channels c
  where c.type = 'dm'
    and (select count(*) from channel_members m where m.channel_id = c.id) = 2
    and exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = me)
    and exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = other)
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into channels (type, created_by) values ('dm', me) returning id into fresh;
  insert into channel_members (channel_id, user_id) values (fresh, me), (fresh, other);
  return fresh;
end;
$$;

/**
 * Create a named group chat.
 *
 * "Keep creation cheap: name, pick members, done" (§5.5). Anyone may make one —
 * these become study groups and travel threads — and the creator is a member by
 * construction rather than by remembering to add themselves.
 *
 * The DM restriction is not applied here on purpose: a group chat is visible to
 * everyone in it, which is exactly the property that made the exec DM ban
 * necessary. A group is not an unlogged help desk.
 */
create or replace function create_group(group_name text, members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  fresh uuid;
begin
  if me is null then
    raise exception 'unauthenticated';
  end if;
  if coalesce(trim(group_name), '') = '' then
    raise exception 'a group needs a name' using errcode = 'check_violation';
  end if;

  insert into channels (type, name, created_by) values ('group', trim(group_name), me)
  returning id into fresh;

  insert into channel_members (channel_id, user_id)
  select fresh, unnest(array_append(coalesce(members, '{}'::uuid[]), me))
  on conflict do nothing;

  return fresh;
end;
$$;

/** Add someone to a group you are already in. Groups only — never a DM. */
create or replace function add_to_group(cid uuid, who uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_type text;
begin
  select type into channel_type from channels where id = cid;

  if channel_type is distinct from 'group' then
    raise exception 'members can only be added to group chats'
      using errcode = 'insufficient_privilege';
  end if;
  if not is_channel_member(auth.uid(), cid) then
    raise exception 'not a member of this channel' using errcode = 'insufficient_privilege';
  end if;

  insert into channel_members (channel_id, user_id) values (cid, who)
  on conflict do nothing;
end;
$$;


-- ── The channel list ─────────────────────────────────────────────────────────
/**
 * Every channel the caller is in, with its unread count and last message.
 *
 * Unread is derived from last_read_at rather than stored, so it cannot drift out
 * of step with the messages themselves. Messages the caller wrote are excluded
 * from the count — your own message arriving is not news.
 *
 * DM channels have no name, so this resolves the other participant's instead.
 */
create or replace function my_channels()
returns table (
  id uuid,
  type text,
  name text,
  is_readonly boolean,
  pinned_message_id uuid,
  unread_count int,
  last_message_at timestamptz,
  last_message_body text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.type,
    coalesce(
      c.name,
      (
        select coalesce(nullif(p.preferred_name, ''), p.full_name)
        from channel_members other
        join profiles p on p.id = other.user_id
        where other.channel_id = c.id and other.user_id <> auth.uid()
        limit 1
      )
    ),
    c.is_readonly,
    c.pinned_message_id,
    (
      select count(*)::int from messages m
      where m.channel_id = c.id
        and m.created_at > mine.last_read_at
        and m.author_id <> auth.uid()
    ),
    (select max(m.created_at) from messages m where m.channel_id = c.id),
    (
      select m.body from messages m
      where m.channel_id = c.id
      order by m.created_at desc
      limit 1
    )
  from channels c
  join channel_members mine on mine.channel_id = c.id and mine.user_id = auth.uid()
  order by (select max(m.created_at) from messages m where m.channel_id = c.id) desc nulls last;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Without this, a Realtime subscription connects, reports SUBSCRIBED, and then
-- delivers nothing forever — the quietest possible failure. Broadcast still
-- passes through RLS, so being in the publication grants no extra read access.
--
-- Guarded because the publication is Supabase's, not Postgres's: the test
-- harness runs on stock Postgres and has no such publication to alter.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages;
  end if;
end
$$;


/** Mark a channel read up to now. One row, the caller's own. */
create or replace function mark_channel_read(cid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update channel_members
     set last_read_at = now()
   where channel_id = cid and user_id = auth.uid();
$$;
