-- Phase 3: the cabinet is private, a system task cannot be deleted, and the
-- catalog resolves to a denominator that does not grow with the calendar.

\echo '── The catalog ──'

reset role;
select test_eq((select count(*)::int from cabinet_pieces), 22,
  'the export''s 26 entries resolve to 22 piece types');
select test_eq((select count(*)::int from cabinet_pieces where is_repeatable), 10,
  'the repeatable ones are the placements, the season, and the four recurring commendations');
select test_eq((select count(*)::int from cabinet_pieces where is_secret), 2,
  'two silhouettes stay unlabelled');

-- The failure PHASE_0_NOTES §2 was written to prevent: a season piece per
-- academic year, so the denominator climbs every September.
select test_eq((select count(*)::int from cabinet_pieces where category = 'season'), 1,
  'one season piece, not one per year — the denominator must not grow with time');


\echo '── A cabinet is private ──'

set role authenticated;

-- Give Dana two firsts at different competitions and a season.
reset role;
insert into competitions (id, name_en, name_fr, season_year, status) values
  ('00000000-0000-0000-0000-000000000c02', 'MTBI 2027', 'MTBI 2027', 2027, 'completed');
insert into cabinet_awards (user_id, piece_id, competition_id)
select '00000000-0000-0000-0000-0000000000d1', p.id, c.id
from cabinet_pieces p, competitions c
where p.code = 'place_1st' and c.name_en in ('JDCC 2027', 'MTBI 2027');
insert into cabinet_awards (user_id, piece_id)
select '00000000-0000-0000-0000-0000000000d1', id from cabinet_pieces where code = 'season_complete';
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from cabinet_awards), 3,
  'a delegate sees their own awards');
select test_eq((select earned_count from cabinet_for() where code = 'place_1st'), 2,
  'a repeatable piece is one plinth that counts twice, not two plinths');
select test_eq((select count(*)::int from cabinet_for()), 20,
  'the headline denominator is stable: 22 pieces less the 2 unearned silhouettes');

-- DESIGN_BRIEF §5.8: "delegates see only their own." No leaderboard, and no way
-- to build one.
select act_as('00000000-0000-0000-0000-0000000000d2');
select test_eq((select count(*)::int from cabinet_awards), 0,
  'a teammate cannot read another delegate''s awards');
select test_eq((select coalesce(sum(earned_count), 0)::int from cabinet_for('00000000-0000-0000-0000-0000000000d1')), 0,
  'and cannot read them by asking cabinet_for() for someone else');

select act_as('00000000-0000-0000-0000-0000000000c1');   -- Cam coaches Finance A
select test_eq((select coalesce(sum(earned_count), 0)::int from cabinet_for('00000000-0000-0000-0000-0000000000d1')), 3,
  'a coach can open their own delegate''s cabinet');

select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select coalesce(sum(earned_count), 0)::int from cabinet_for('00000000-0000-0000-0000-0000000000d1')), 3,
  'so can an executive');

-- Granting is the executive's job (DESIGN_BRIEF §5.8), so this is a plain insert
-- that must simply work.
insert into cabinet_awards (user_id, piece_id)
select '00000000-0000-0000-0000-0000000000d2', id from cabinet_pieces where code = 'com_wolf_pin';
select test_eq((select count(*)::int from cabinet_awards
                where user_id = '00000000-0000-0000-0000-0000000000d2'), 1,
  'an executive grants an award');

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  -- A piece the delegate can actually read, so this tests awards_write rather
  -- than accidentally testing pieces_read: selecting a secret piece as a
  -- delegate returns no rows, and an insert of nothing succeeds vacuously.
  insert into cabinet_awards (user_id, piece_id)
  select '00000000-0000-0000-0000-0000000000d1', id from cabinet_pieces where code = 'ms_orientation';
  raise exception 'FAIL: a delegate awarded themselves a piece';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot award themselves';
end
$$;


\echo '── Secret pieces stay silhouettes ──'

select test_eq((select count(*)::int from cabinet_pieces where code = 'com_wolf_pin'), 0,
  'a delegate cannot even read a secret piece they have not earned');

select act_as('00000000-0000-0000-0000-0000000000d2');   -- Drew was granted one above
select test_eq((select count(*)::int from cabinet_pieces where code = 'com_wolf_pin'), 1,
  'but can once it is theirs');


\echo '── Tasks: is_system is the one that cannot be deleted ──'

reset role;
insert into tasks (id, owner_id, title, source, is_system, created_by) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000d1',
   'Sign the waiver', 'auto', true, '00000000-0000-0000-0000-0000000000e1');
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from tasks), 1, 'the delegate sees their system task');

do $$
begin
  delete from tasks where id = '00000000-0000-0000-0000-00000000aa01';
  if not found then
    raise notice 'ok  a system task cannot be deleted';
  else
    raise exception 'FAIL: a system task was deleted — a waiver just vanished';
  end if;
end
$$;

-- Completing it is an update, which is exactly what should be allowed.
update tasks set completed_at = now() where id = '00000000-0000-0000-0000-00000000aa01';
select test_true((select completed_at is not null from tasks where id = '00000000-0000-0000-0000-00000000aa01'),
  'but it can be completed');

-- A delegate can keep their own list.
insert into tasks (owner_id, title, source) values
  ('00000000-0000-0000-0000-0000000000d1', 'Read the case brief', 'self');
select test_eq((select count(*)::int from tasks where source = 'self'), 1,
  'a delegate adds their own tasks');

delete from tasks where source = 'self';
select test_eq((select count(*)::int from tasks where source = 'self'), 0,
  'and can delete those');

do $$
begin
  insert into tasks (owner_id, title, source, is_system)
  values ('00000000-0000-0000-0000-0000000000d2', 'Undeletable', 'self', true);
  raise exception 'FAIL: a delegate minted an undeletable task for someone else';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot create a system task';
end
$$;

do $$
begin
  insert into tasks (owner_id, title, source)
  values ('00000000-0000-0000-0000-0000000000d3', 'Do my bidding', 'exec');
  raise exception 'FAIL: a delegate assigned a task to someone else';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot assign tasks to others';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000c1');
insert into tasks (owner_id, title, source, created_by)
values ('00000000-0000-0000-0000-0000000000d1', 'Practice deck run-through', 'coach',
        '00000000-0000-0000-0000-0000000000c1');
select test_eq((select count(*)::int from tasks where source = 'coach'), 1,
  'a coach assigns to their own delegate');

do $$
begin
  insert into tasks (owner_id, title, source, created_by)
  values ('00000000-0000-0000-0000-0000000000d3', 'Not your delegate', 'coach',
          '00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL: a coach assigned a task outside the teams they coach';
exception when insufficient_privilege then
  raise notice 'ok  a coach cannot assign outside their own teams';
end
$$;


\echo '── Events: audience scoping ──'

reset role;
insert into events (title_en, type, starts_at, audience_type) values
  ('Season kickoff', 'social', now() + interval '7 days', 'everyone');
insert into events (title_en, type, starts_at, audience_type, audience_ref) values
  ('Finance A practice', 'practice', now() + interval '2 days', 'team',
   '00000000-0000-0000-0000-00000000ee01');
insert into events (title_en, type, starts_at, audience_type, audience_ref) values
  ('Exec sync', 'admin', now() + interval '1 day', 'role', 'executive');
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');   -- Finance A
select test_eq((select count(*)::int from events), 2,
  'a delegate sees the open event and their own team''s, not the exec sync');

select act_as('00000000-0000-0000-0000-0000000000d3');   -- Marketing B
select test_eq((select count(*)::int from events), 1,
  'another team sees only the open one');

select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from events), 3, 'an executive sees all three');

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  insert into events (title_en, type, starts_at, audience_type)
  values ('Fake all-hands', 'admin', now(), 'everyone');
  raise exception 'FAIL: a delegate created an event';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot create events';
end
$$;

-- RSVPs are the one thing a delegate writes here.
insert into event_rsvps (event_id, user_id, status)
select id, '00000000-0000-0000-0000-0000000000d1', 'going' from events where title_en = 'Season kickoff';
select test_eq((select count(*)::int from event_rsvps), 1, 'a delegate RSVPs for themselves');

do $$
begin
  insert into event_rsvps (event_id, user_id, status)
  select id, '00000000-0000-0000-0000-0000000000d3', 'declined' from events where title_en = 'Season kickoff';
  raise exception 'FAIL: a delegate RSVPd on somebody else''s behalf';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot RSVP for someone else';
end
$$;

reset role;
