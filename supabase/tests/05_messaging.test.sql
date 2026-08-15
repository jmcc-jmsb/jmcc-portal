-- Phase 5: messages are membership-scoped, announcements are read-only, and a
-- delegate cannot open a direct message with an executive.

\echo '── Channels are membership-scoped ──'

reset role;
insert into channels (id, type, name, is_readonly, created_by) values
  ('00000000-0000-0000-0000-00000000c4a1', 'announcement', 'Announcements', true,
   '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000c4a2', 'team', 'Finance A', false,
   '00000000-0000-0000-0000-0000000000e1');

insert into channel_members (channel_id, user_id) values
  ('00000000-0000-0000-0000-00000000c4a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000c4a1', '00000000-0000-0000-0000-0000000000d3'),
  ('00000000-0000-0000-0000-00000000c4a1', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000c4a2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000c4a2', '00000000-0000-0000-0000-0000000000d2');

insert into messages (id, channel_id, author_id, body) values
  ('00000000-0000-0000-0000-00000000e551', '00000000-0000-0000-0000-00000000c4a1',
   '00000000-0000-0000-0000-0000000000e1', 'Buses leave at 6am sharp.'),
  ('00000000-0000-0000-0000-00000000e552', '00000000-0000-0000-0000-00000000c4a2',
   '00000000-0000-0000-0000-0000000000d2', 'Deck draft is in the drive.');
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');   -- in both channels
select test_eq((select count(*)::int from channels), 2, 'a member sees their channels');
select test_eq((select count(*)::int from messages), 2, 'and the messages in them');

select act_as('00000000-0000-0000-0000-0000000000d3');   -- announcements only
select test_eq((select count(*)::int from channels), 1,
  'someone in one channel sees only that one');
select test_eq((select count(*)::int from messages), 1,
  'and cannot read the other team''s messages');

-- An executive administers announcements without being everywhere. A group chat
-- an exec was not added to stays private, which is the whole point of having
-- group chats rather than one enormous room.
select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from channels where type = 'team'), 0,
  'an executive does not see team channels they are not in');


\echo '── Announcement channels are read-only for delegates ──'

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  insert into messages (channel_id, author_id, body)
  values ('00000000-0000-0000-0000-00000000c4a1', '00000000-0000-0000-0000-0000000000d1', 'Reply');
  raise exception 'FAIL: a delegate posted in an announcement channel';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot post in an announcement channel';
end
$$;

-- But can in a normal one.
insert into messages (channel_id, author_id, body)
values ('00000000-0000-0000-0000-00000000c4a2', '00000000-0000-0000-0000-0000000000d1', 'On it.');
select test_eq((select count(*)::int from messages where channel_id = '00000000-0000-0000-0000-00000000c4a2'), 2,
  'and can post in a team channel');

do $$
begin
  insert into messages (channel_id, author_id, body)
  values ('00000000-0000-0000-0000-00000000c4a2', '00000000-0000-0000-0000-0000000000d2', 'Forged');
  raise exception 'FAIL: a message was posted under another member''s name';
exception when insufficient_privilege then
  raise notice 'ok  a message cannot be posted under somebody else''s name';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000e1');
insert into messages (channel_id, author_id, body)
values ('00000000-0000-0000-0000-00000000c4a1', '00000000-0000-0000-0000-0000000000e1', 'Second notice.');
select test_eq((select count(*)::int from messages where channel_id = '00000000-0000-0000-0000-00000000c4a1'), 2,
  'an executive posts in the announcement channel');

-- Nobody edits somebody else's words, exec included.
do $$
begin
  update messages set body = 'Rewritten'
   where id = '00000000-0000-0000-0000-00000000e552';
  if found then
    raise exception 'FAIL: an executive rewrote another person''s message';
  else
    raise notice 'ok  an executive cannot edit somebody else''s message';
  end if;
end
$$;


\echo '── Direct messages: a delegate cannot open one with an executive ──'

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  perform open_dm('00000000-0000-0000-0000-0000000000e1');
  raise exception 'FAIL: a delegate opened a DM with an executive';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot DM an executive';
end
$$;

-- Delegate to delegate is the ordinary case.
select test_true(open_dm('00000000-0000-0000-0000-0000000000d2') is not null,
  'a delegate can DM another delegate');

-- Opening the same conversation twice returns the same room rather than a second
-- one, which is what stops a channel list filling with duplicates of one person.
select test_eq(
  (select open_dm('00000000-0000-0000-0000-0000000000d2')),
  (select open_dm('00000000-0000-0000-0000-0000000000d2')),
  'opening a DM twice reuses the same channel');

select test_true(open_dm('00000000-0000-0000-0000-0000000000c1') is not null,
  'a delegate can DM their coach');

-- The staff side is unaffected: the rule is about delegates, not about silence.
select act_as('00000000-0000-0000-0000-0000000000c1');
select test_true(open_dm('00000000-0000-0000-0000-0000000000e1') is not null,
  'a coach can DM an executive');

do $$
begin
  perform open_dm('00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL: opened a DM with oneself';
exception when insufficient_privilege then
  raise notice 'ok  you cannot DM yourself';
end
$$;


\echo '── Group chats ──'

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_true(
  create_group('Travel logistics', array['00000000-0000-0000-0000-0000000000d2'::uuid]) is not null,
  'a delegate creates a group chat');

select test_eq(
  (select count(*)::int from channel_members
    where channel_id = (select id from channels where name = 'Travel logistics')),
  2,
  'and is a member of it without having to add themselves');

do $$
begin
  perform create_group('   ', array[]::uuid[]);
  raise exception 'FAIL: created a group with no name';
exception when check_violation then
  raise notice 'ok  a group needs a name';
end
$$;

-- A group is visible to everyone in it, which is why the exec DM rule does not
-- apply here: a group is not an unlogged help desk.
select test_true(
  create_group('Case prep', array['00000000-0000-0000-0000-0000000000e1'::uuid]) is not null,
  'a group chat may include an executive');

-- Adding is for groups only. Slipping a third person into a DM would turn a
-- private conversation into a room without anyone being told.
do $$
begin
  perform add_to_group(
    (select id from channels where type = 'dm' limit 1),
    '00000000-0000-0000-0000-0000000000d3');
  raise exception 'FAIL: added a third member to a direct message';
exception when insufficient_privilege then
  raise notice 'ok  nobody can be added to a direct message';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000d3');
do $$
begin
  perform add_to_group(
    (select id from channels where name = 'Travel logistics'),
    '00000000-0000-0000-0000-0000000000d3');
  raise exception 'FAIL: added themselves to a group they are not in';
exception when insufficient_privilege then
  raise notice 'ok  you cannot add yourself to a group you are not in';
end
$$;


\echo '── Unread counts and acknowledgements ──'

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_true(
  (select unread_count from my_channels() where id = '00000000-0000-0000-0000-00000000c4a1') > 0,
  'an unread announcement counts');

select mark_channel_read('00000000-0000-0000-0000-00000000c4a1');
select test_eq(
  (select unread_count from my_channels() where id = '00000000-0000-0000-0000-00000000c4a1'), 0,
  'and stops counting once the channel is read');

-- Your own message arriving is not news. Read the channel first, so what is
-- being measured is the new message and not the teammate's earlier one.
select mark_channel_read('00000000-0000-0000-0000-00000000c4a2');
insert into messages (channel_id, author_id, body)
values ('00000000-0000-0000-0000-00000000c4a2', '00000000-0000-0000-0000-0000000000d1', 'Mine');
select test_eq(
  (select unread_count from my_channels() where id = '00000000-0000-0000-0000-00000000c4a2'), 0,
  'your own message does not make a channel unread');

-- And a teammate's does.
reset role;
insert into messages (channel_id, author_id, body)
values ('00000000-0000-0000-0000-00000000c4a2', '00000000-0000-0000-0000-0000000000d2', 'Theirs');
set role authenticated;
select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq(
  (select unread_count from my_channels() where id = '00000000-0000-0000-0000-00000000c4a2'), 1,
  'but a teammate''s message does');

select test_true(
  (select name from my_channels() where type = 'dm' limit 1) is not null,
  'a DM takes its name from the other participant');

insert into message_acks (message_id, user_id)
values ('00000000-0000-0000-0000-00000000e551', '00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from message_acks), 1, 'a delegate acknowledges an announcement');

do $$
begin
  insert into message_acks (message_id, user_id)
  values ('00000000-0000-0000-0000-00000000e551', '00000000-0000-0000-0000-0000000000d3');
  raise exception 'FAIL: acknowledged on somebody else''s behalf';
exception when insufficient_privilege then
  raise notice 'ok  you cannot acknowledge for someone else';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from message_acks), 1,
  'an executive can see who has acknowledged');

reset role;


\echo '── Push subscriptions are per-device and private ──'

set role authenticated;
select act_as('00000000-0000-0000-0000-0000000000d1');

insert into push_subscriptions (user_id, endpoint, keys)
values ('00000000-0000-0000-0000-0000000000d1', 'https://push.example/aaa',
        '{"p256dh":"k","auth":"a"}');
select test_eq((select count(*)::int from push_subscriptions), 1,
  'a delegate registers their own device');

do $$
begin
  insert into push_subscriptions (user_id, endpoint, keys)
  values ('00000000-0000-0000-0000-0000000000d2', 'https://push.example/bbb',
          '{"p256dh":"k","auth":"a"}');
  raise exception 'FAIL: registered a push subscription under another user';
exception when insufficient_privilege then
  raise notice 'ok  a subscription cannot be registered for someone else';
end
$$;

-- A subscription is a capability to notify a device. Nobody else needs to know
-- which devices a delegate carries — not even an executive, since sending runs
-- on the secret key and does not consult this policy.
select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from push_subscriptions), 0,
  'an executive cannot enumerate a delegate''s devices');

select act_as('00000000-0000-0000-0000-0000000000d1');
delete from push_subscriptions where endpoint = 'https://push.example/aaa';
select test_eq((select count(*)::int from push_subscriptions), 0,
  'and you can remove your own');

reset role;
