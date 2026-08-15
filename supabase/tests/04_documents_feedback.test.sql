-- Phase 4: a delegate cannot read an internal note, and cannot tell one exists.
-- HANDOFF §10: "A delegate cannot select internal feedback_notes, and the UI
-- leaks no count or gap."

\echo '── Feedback: the three visibility levels ──'

reset role;
insert into feedback_notes (id, author_id, subject_user_id, note_type, body, visibility, rubric) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000d1', 'coach_note',
   'Strong open. Tighten the Q&A.', 'shared', '{"content":4,"delivery":4,"qa":2,"teamwork":5}'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000d1', 'coach_note',
   'Not ready to captain a team yet. Revisit in March.', 'internal', null);

insert into feedback_notes (id, author_id, subject_user_id, note_type, body, visibility) values
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000d1', 'self_reflection',
   'Froze on the second question. Practise cold opens.', 'private');
set role authenticated;

-- The subject of both notes.
select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from feedback_notes where visibility = 'shared'), 1,
  'a delegate reads the note shared with them');

-- The checklist item, stated the strong way: not "cannot read the body" but
-- "the row is not there", so there is no count and no gap to notice.
select test_eq((select count(*)::int from feedback_notes where visibility = 'internal'), 0,
  'a delegate cannot read an internal note');
select test_eq((select count(*)::int from feedback_notes), 2,
  'and the total they can count is their shared note plus their own reflection — no gap to infer from');

select test_eq((select count(*)::int from feedback_notes where note_type = 'self_reflection'), 1,
  'their own self-reflection is theirs to read');

-- A private self-reflection is not management information.
select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from feedback_notes where visibility = 'private'), 0,
  'an executive cannot read a delegate''s private self-reflection');
select test_eq((select count(*)::int from feedback_notes where visibility = 'internal'), 1,
  'but can read internal coaching notes');

select act_as('00000000-0000-0000-0000-0000000000c1');
select test_eq((select count(*)::int from feedback_notes where visibility = 'internal'), 1,
  'the coach who wrote it can read it');
select test_eq((select count(*)::int from feedback_notes where visibility = 'private'), 0,
  'and cannot read their delegate''s private reflection');

-- Another delegate on another team learns nothing at all.
select act_as('00000000-0000-0000-0000-0000000000d3');
select test_eq((select count(*)::int from feedback_notes), 0,
  'an unrelated delegate reads none of it');


\echo '── Feedback: who may write what ──'

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  insert into feedback_notes (author_id, subject_user_id, note_type, body, visibility)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2',
          'coach_note', 'You were fine', 'shared');
  raise exception 'FAIL: a delegate wrote a coaching note about someone else';
exception when insufficient_privilege then
  raise notice 'ok  a delegate cannot write coaching notes about others';
end
$$;

do $$
begin
  insert into feedback_notes (author_id, subject_user_id, note_type, body, visibility)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
          'coach_note', 'Forged', 'internal');
  raise exception 'FAIL: a delegate wrote a note under the coach''s name';
exception when insufficient_privilege then
  raise notice 'ok  a note cannot be written under somebody else''s name';
end
$$;

-- A self-reflection labelled internal would be a private thought filed where a
-- coach can read it. The check constraint refuses it outright.
do $$
begin
  insert into feedback_notes (author_id, subject_user_id, note_type, body, visibility)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
          'self_reflection', 'Mislabelled', 'internal');
  raise exception 'FAIL: a self-reflection was stored as internal';
exception when check_violation then
  raise notice 'ok  a self-reflection is always private, by constraint';
end
$$;

select act_as('00000000-0000-0000-0000-0000000000c1');
insert into feedback_notes (author_id, subject_user_id, note_type, body, visibility)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2',
        'coach_note', 'Good progress on structure.', 'shared');
select test_eq((select count(*)::int from feedback_notes where subject_user_id = '00000000-0000-0000-0000-0000000000d2'), 1,
  'a coach writes about their own delegate');

do $$
begin
  insert into feedback_notes (author_id, subject_user_id, note_type, body, visibility)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d3',
          'coach_note', 'Not my delegate', 'shared');
  raise exception 'FAIL: a coach wrote about a delegate they do not coach';
exception when insufficient_privilege then
  raise notice 'ok  a coach cannot write about delegates they do not coach';
end
$$;

-- An executive may not rewrite what a coach said: this is a record, and the exec
-- view is about coverage rather than content.
select act_as('00000000-0000-0000-0000-0000000000e1');
update feedback_notes set body = 'Rewritten by exec'
 where id = '00000000-0000-0000-0000-00000000fa01';
select test_eq((select body from feedback_notes where id = '00000000-0000-0000-0000-00000000fa01'),
  'Strong open. Tighten the Q&A.',
  'an executive cannot rewrite a coach''s note');


\echo '── Feedback coverage is counts, never content ──'

select test_true((select count(*)::int from feedback_coverage() where note_count = 0) > 0,
  'the coverage view names delegates with no notes yet');
select test_eq((select note_count from feedback_coverage()
                where user_id = '00000000-0000-0000-0000-0000000000d1'), 2,
  'and counts the coaching notes on someone who has them');

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from feedback_coverage()), 0,
  'a delegate gets nothing from the coverage view');


\echo '── Documents ──'

reset role;
insert into document_templates (id, name_en, name_fr, docuseal_template_id) values
  ('00000000-0000-0000-0000-00000000d0c1', 'Liability waiver', 'Décharge de responsabilité', '101'),
  ('00000000-0000-0000-0000-00000000d0c2', 'Code of conduct', 'Code de conduite', '102');

insert into document_assignments (id, template_id, user_id, status, docuseal_submission_id) values
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d0c1',
   '00000000-0000-0000-0000-0000000000d1', 'not_started', 'sub-1'),
  ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-00000000d0c2',
   '00000000-0000-0000-0000-0000000000d1', 'signed', 'sub-2'),
  ('00000000-0000-0000-0000-00000000d0a3', '00000000-0000-0000-0000-00000000d0c1',
   '00000000-0000-0000-0000-0000000000d3', 'not_started', 'sub-3');
set role authenticated;

select act_as('00000000-0000-0000-0000-0000000000d1');
select test_eq((select count(*)::int from document_assignments), 2,
  'a delegate sees only their own documents');
select test_eq((select signed from my_document_progress()), 1,
  'and their progress line counts what is signed');
select test_eq((select total from my_document_progress()), 2, 'out of what is assigned');

-- A waiver is between the delegate and the executive. A coach seeing who has not
-- signed their medical form is not coaching information.
select act_as('00000000-0000-0000-0000-0000000000c1');
select test_eq((select count(*)::int from document_assignments), 0,
  'a coach does not see their delegates'' documents');

select act_as('00000000-0000-0000-0000-0000000000e1');
select test_eq((select count(*)::int from document_assignments), 3,
  'an executive sees the whole matrix');

select act_as('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  update document_assignments set status = 'signed'
   where id = '00000000-0000-0000-0000-00000000d0a1';
  if found then
    raise exception 'FAIL: a delegate marked their own document signed';
  else
    raise notice 'ok  a delegate cannot mark their own document signed';
  end if;
end
$$;

reset role;
