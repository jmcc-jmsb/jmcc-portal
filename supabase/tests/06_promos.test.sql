-- Phase 7: one promo slot, audience-scoped, and dismissal sticks.

\echo '── Promos ──'

reset role;
insert into promos (id, title, hook, audience_type, display_from, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'Wine and cheese', 'Meet the delegation', 'everyone',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000b2', 'Older promo', 'Still running', 'everyone',
   now() - interval '10 days', '00000000-0000-0000-0000-0000000000e1');

-- Outside its window, and for one role only.
insert into promos (id, title, audience_type, display_from, display_until, created_by) values
  ('00000000-0000-0000-0000-0000000000b3', 'Expired', 'everyone',
   now() - interval '10 days', now() - interval '1 day', '00000000-0000-0000-0000-0000000000e1');
insert into promos (id, title, audience_type, audience_ref, display_from, created_by) values
  ('00000000-0000-0000-0000-0000000000b4', 'Exec social', 'role', 'executive',
   now() - interval '1 day', '00000000-0000-0000-0000-0000000000e1');
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from active_promo()), 1,
  'never more than one promo card, enforced by the function rather than the client');
select test_eq((select title from active_promo()), 'Wine and cheese',
  'and it is the most recently published eligible one');

select test_eq((select count(*)::int from promos where title = 'Exec social'), 0,
  'a role-scoped promo is invisible outside that role');
select test_eq((select count(*)::int from promos where title = 'Expired'), 1,
  'an expired promo is still readable — it is out of its window, not out of audience');

-- Dismissal is recorded, so it holds across devices.
insert into promo_dismissals (promo_id, user_id)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1');
select test_eq((select title from active_promo()), 'Older promo',
  'dismissing one falls through to the next rather than emptying the slot');

do $$
begin
  insert into promo_dismissals (promo_id, user_id)
  values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2');
  raise exception 'FAIL: dismissed a promo on somebody else''s behalf';
exception when insufficient_privilege then
  raise notice 'ok  you cannot dismiss a promo for someone else';
end
$$;

do $$
begin
  insert into promos (title, audience_type, created_by)
  values ('Delegate advert', 'everyone', '00000000-0000-0000-0000-0000000000d1');
  raise exception 'FAIL: a delegate published a promo';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot publish a promo';
end
$$;

-- The FOR ALL read-widening from 0007 must not have been repeated here.
select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from active_promo()), 1,
  'an executive still gets one slot, not the whole table');

reset role;
select test_eq(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public still has row level security enabled');
