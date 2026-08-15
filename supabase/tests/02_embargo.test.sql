-- The Phase 2 acceptance test, plus the Phase 1 checklist item that needed a
-- live database to close.
--
-- HANDOFF §9: "a delegate account cannot reach materials before release via a
-- direct API call, not just the UI." Everything below is a direct call — no
-- endpoint, no client, just a caller and a policy.

\echo '── Sealed: what a delegate can reach before release ──'

set role authenticated;
select act_as('00000000-0000-0000-0000-0000000000d1');   -- Dana, Finance A

-- The two that matter. A delegate querying the tables directly gets nothing.
select test_eq((select count(*)::int from case_materials), 0,
  'delegate reads zero case_materials before release');
select test_eq((select count(*)::int from cases), 0,
  'delegate reads zero cases before release');

-- But the sealed screen still has something to render, and it is redacted in
-- SQL rather than in the client.
select test_eq((select count(*)::int from my_cases()), 1,
  'delegate sees the sealed case through my_cases()');
select test_eq((select released from my_cases()), false,
  'my_cases() reports it as not released');
select test_eq((select title from my_cases()), null::text,
  'the title is withheld while sealed — a title leaks the case topic');
select test_eq((select description from my_cases()), null::text,
  'the description is withheld while sealed');
select test_true((select release_at is not null from my_cases()),
  'the countdown still gets its release time');


\echo '── Audience: someone outside the competition ──'

select act_as('00000000-0000-0000-0000-0000000000f1');   -- Otto, on no team
select test_eq((select count(*)::int from my_cases()), 0,
  'a delegate outside the audience does not learn the case exists');
select test_eq((select count(*)::int from case_materials), 0,
  'and reads no materials');


\echo '── Executives see through the seal, coaches do not by default ──'

select act_as('00000000-0000-0000-0000-0000000000e1');   -- Eve, executive
select test_eq((select count(*)::int from case_materials), 2,
  'an executive reads materials before release');
select test_true((select title is not null from my_cases()),
  'and sees the title');

select act_as('00000000-0000-0000-0000-0000000000c1');   -- Cam, coach of Finance A
select test_eq((select count(*)::int from case_materials), 0,
  'a coach on the default visibility waits with the delegates');


\echo '── coach_visibility = early ──'

reset role;
update cases
   set coach_visibility = 'early',
       coach_release_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-00000000ca01';
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000c1');
select test_eq((select count(*)::int from case_materials), 2,
  'early access opens the case to the coach');

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from case_materials), 0,
  'and does NOT open it to the delegates — the whole point of the setting');


\echo '── Force release ──'

reset role;
update cases
   set coach_visibility = 'same', coach_release_at = null,
       force_released_at = now()
 where id = '00000000-0000-0000-0000-00000000ca01';
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from case_materials), 2,
  'force release reaches the delegates immediately');

select act_as('00000000-0000-0000-0000-0000000000f1');
select test_eq((select count(*)::int from case_materials), 0,
  'force release does not widen the audience');


\echo '── Released on schedule ──'

reset role;
update cases
   set force_released_at = null,
       release_at = now() - interval '1 hour',
       submission_opens_at = now() - interval '1 hour',
       submission_closes_at = now() + interval '1 hour'
 where id = '00000000-0000-0000-0000-00000000ca01';
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from case_materials), 2,
  'the delegate reads materials once release_at has passed');
select test_eq((select count(*)::int from cases), 1,
  'and the case row itself becomes visible');
select test_true((select title is not null from my_cases()),
  'and the title is no longer redacted');


\echo '── Submission ──'

select test_eq((select my_team_for_case('00000000-0000-0000-0000-00000000ca01')),
  '00000000-0000-0000-0000-00000000ee01'::uuid,
  'the delegate submits as their own team, derived not declared');

select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select my_team_for_case('00000000-0000-0000-0000-00000000ca01')), null::uuid,
  'an executive is on no team and therefore cannot submit');

select act_as('00000000-0000-0000-0000-0000000000d1');
insert into case_submissions (case_id, team_id, submitted_by, version, files)
values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ee01',
        '00000000-0000-0000-0000-0000000000d1', 1, '[{"name":"deck.pptx"}]');
select test_eq((select count(*)::int from case_submissions), 1,
  'a team member submits inside the window');

-- Any team member, not just one: DESIGN_BRIEF §5.7 state 3.
select act_as('00000000-0000-0000-0000-0000000000d2');
insert into case_submissions (case_id, team_id, submitted_by, version, files)
values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ee01',
        '00000000-0000-0000-0000-0000000000d2', 2, '[{"name":"deck-final.pptx"}]');
select test_eq((select count(*)::int from case_submissions), 2,
  'a teammate submits the next version');

do $$
begin
  insert into case_submissions (case_id, team_id, submitted_by, version, files)
  values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ee02',
          '00000000-0000-0000-0000-0000000000d2', 1, '[{"name":"stolen.pptx"}]');
  raise exception 'FAIL: submitted on behalf of a team the caller is not on';
exception when insufficient_privilege then
  raise notice 'ok  cannot submit for another team';
end
$$;

do $$
begin
  insert into case_submissions (case_id, team_id, submitted_by, version, files)
  values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ee01',
          '00000000-0000-0000-0000-0000000000d1', 3, '[{"name":"forged.pptx"}]');
  raise exception 'FAIL: submitted under another member''s name';
exception when insufficient_privilege then
  raise notice 'ok  cannot submit as somebody else';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000d3');   -- Blair, Marketing B
select test_eq((select count(*)::int from case_submissions), 0,
  'another team cannot read this team''s submissions');

select act_as('00000000-0000-0000-0000-0000000000c1');   -- Cam coaches Finance A
select test_eq((select count(*)::int from case_submissions), 2,
  'the coach of the team can read them');


\echo '── Submission window is enforced by the database, not only the endpoint ──'

reset role;
update cases set submission_closes_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-00000000ca01';
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  insert into case_submissions (case_id, team_id, submitted_by, version, files)
  values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000ee01',
          '00000000-0000-0000-0000-0000000000d1', 3, '[{"name":"late.pptx"}]');
  raise exception 'FAIL: accepted a submission after the window closed';
exception when insufficient_privilege then
  raise notice 'ok  a late submission is refused even with a direct insert';
end
$$;


\echo '── The roster a monitor counts against ──'

reset role;
update cases set submission_closes_at = now() + interval '1 hour'
 where id = '00000000-0000-0000-0000-00000000ca01';
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from case_roster('00000000-0000-0000-0000-00000000ca01')), 2,
  'an executive monitors every team in the case');

select act_as('00000000-0000-0000-0000-0000000000c1');
select test_eq((select count(*)::int from case_roster('00000000-0000-0000-0000-00000000ca01')), 1,
  'a coach monitors only the teams they coach');

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from case_roster('00000000-0000-0000-0000-00000000ca01')), 1,
  'a delegate never learns how many other teams are competing');


\echo '── The audit trail cannot be written by the people it describes ──'

do $$
begin
  insert into audit_log (actor_id, action, entity_type)
  values ('00000000-0000-0000-0000-0000000000d1', 'case.submit', 'case');
  raise exception 'FAIL: a signed-in user forged an audit entry';
exception when insufficient_privilege then
  raise notice 'ok  audit_log rejects writes from a JWT';
end
$$;


\echo '── HANDOFF §10: an executive cannot insert into user_roles ──'
-- Carried over from Phase 1, where it could be written but not exercised.

select act_as('00000000-0000-0000-0000-0000000000e1');
do $$
begin
  insert into user_roles (user_id, role)
  values ('00000000-0000-0000-0000-0000000000e1', 'superuser');
  raise exception 'FAIL: an executive promoted themselves to superuser';
exception when insufficient_privilege then
  raise notice 'ok  an executive cannot grant themselves a role';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000a1');
insert into user_roles (user_id, role)
values ('00000000-0000-0000-0000-0000000000f1', 'coach');
select test_eq((select count(*)::int from user_roles
                where user_id = '00000000-0000-0000-0000-0000000000f1'), 2,
  'a superuser can');


\echo '── Profile privacy: a teammate knows your name, not your allergies ──'

reset role;
update profiles
   set allergies = 'peanuts, severe',
       emergency_contact_phone = '555-0199',
       accessibility_needs = 'needs step-free access'
 where id = '00000000-0000-0000-0000-0000000000d2';
set role authenticated;

-- Dana and Drew are on Finance A together. Dana is not a coach and not an exec.
select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq(
  (select count(*)::int from profiles where id = '00000000-0000-0000-0000-0000000000d2'),
  0,
  'a teammate cannot read another delegate''s profile row');

select test_eq(
  (select display_name from visible_profile_names(array['00000000-0000-0000-0000-0000000000d2'::uuid])),
  'Drew Alpha',
  'but can still resolve their name, which is all a roster needed');

select act_as('00000000-0000-0000-0000-0000000000d3');   -- Blair, another team
select test_eq(
  (select count(*)::int from visible_profile_names(array['00000000-0000-0000-0000-0000000000d2'::uuid])),
  0,
  'someone on another team resolves no name at all');

-- Kept deliberately: a coach books the meals and travels with the team.
select act_as('00000000-0000-0000-0000-0000000000c1');
select test_eq(
  (select allergies from profiles where id = '00000000-0000-0000-0000-0000000000d2'),
  'peanuts, severe',
  'a coach still sees their own delegates'' dietary and accessibility needs');

select act_as('00000000-0000-0000-0000-0000000000d2');
select test_eq(
  (select allergies from profiles where id = '00000000-0000-0000-0000-0000000000d2'),
  'peanuts, severe',
  'and you can always read your own');


\echo '── RLS is on everywhere (HANDOFF §10, first item) ──'

reset role;
select test_eq(
  (select count(*)::int from pg_tables
    where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has row level security enabled');

\echo ''
\echo 'All assertions passed.'
