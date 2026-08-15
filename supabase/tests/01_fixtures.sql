-- Grants, a tiny assertion helper, and one competition's worth of people.
-- Applied after the migrations, before the assertions.

-- Supabase grants these blanket privileges to `authenticated` and lets RLS do
-- the deciding. Reproducing that here matters: if the tests ran with narrower
-- grants they would pass for the wrong reason.
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
grant select on storage.buckets to authenticated;


-- ── Assertion helpers ────────────────────────────────────────────────────────
-- A failed assertion raises, psql runs with ON_ERROR_STOP, so the container exits
-- non-zero and the script fails. No framework needed.

create or replace function test_eq(actual anyelement, expected anyelement, label text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — got %, expected %', label, actual, expected;
  end if;
  raise notice 'ok  %', label;
end
$$;

create or replace function test_true(actual boolean, label text)
returns void
language plpgsql
as $$
begin
  perform test_eq(coalesce(actual, false), true, label);
end
$$;

/** Impersonate a signed-in caller, exactly as PostgREST does for a real JWT. */
create or replace function act_as(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false);
end
$$;


-- ── People ───────────────────────────────────────────────────────────────────
-- Fixed uuids so a failure message points at a recognisable person.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'super@jmcc.test',   '{"full_name":"Sam Superuser"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'exec@jmcc.test',    '{"full_name":"Eve Executive"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach@jmcc.test',   '{"full_name":"Cam Coach"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'alpha1@jmcc.test',  '{"full_name":"Dana Alpha"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'alpha2@jmcc.test',  '{"full_name":"Drew Alpha"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'bravo1@jmcc.test',  '{"full_name":"Blair Bravo"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'outside@jmcc.test', '{"full_name":"Otto Outsider"}');

-- Profiles arrive via the handle_new_user() trigger, which is itself worth
-- confirming before anything else leans on it.
select test_eq((select count(*)::int from profiles), 7, 'trigger created a profile per auth user');

insert into user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'superuser'),
  ('00000000-0000-0000-0000-0000000000e1', 'executive'),
  ('00000000-0000-0000-0000-0000000000c1', 'coach'),
  ('00000000-0000-0000-0000-0000000000d1', 'delegate'),
  ('00000000-0000-0000-0000-0000000000d2', 'delegate'),
  ('00000000-0000-0000-0000-0000000000d3', 'delegate'),
  ('00000000-0000-0000-0000-0000000000f1', 'delegate');


-- ── One competition, two teams ───────────────────────────────────────────────
insert into disciplines (id, name_en, name_fr, sort_order) values
  ('00000000-0000-0000-0000-000000000d01', 'Finance', 'Finance', 1),
  ('00000000-0000-0000-0000-000000000d02', 'Marketing', 'Marketing', 2);

insert into competitions (id, name_en, name_fr, season_year, status) values
  ('00000000-0000-0000-0000-000000000c01', 'JDCC 2027', 'JDCC 2027', 2027, 'active');

insert into teams (id, competition_id, discipline_id, name) values
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d01', 'Finance A'),
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-000000000c01',
   '00000000-0000-0000-0000-000000000d02', 'Marketing B');

insert into team_members (team_id, user_id) values
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000d3');

-- Cam coaches Finance A only, which is what makes the coach-visibility cases
-- meaningful: there is a team they are not entitled to.
insert into team_coaches (team_id, coach_id) values
  ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000c1');


-- ── The case, sealed ─────────────────────────────────────────────────────────
-- Releases tomorrow. Every assertion about the embargo is made against this row
-- before anything moves its clock.
insert into cases (
  id, competition_id, discipline_id, title, description, deliverable_format,
  release_at, submission_opens_at, submission_closes_at,
  audience_type, status, created_by
) values (
  '00000000-0000-0000-0000-00000000ca01',
  '00000000-0000-0000-0000-000000000c01',
  null,
  'Northwind Logistics: the carve-out',
  'Full case description, which is itself embargoed.',
  'PPTX deck, 15 slides',
  now() + interval '1 day',
  now() + interval '1 day',
  now() + interval '2 days',
  'competition', 'scheduled',
  '00000000-0000-0000-0000-0000000000e1'
);

insert into case_materials (case_id, filename, storage_path, kind, size_bytes, sort_order) values
  ('00000000-0000-0000-0000-00000000ca01', 'northwind-case.pdf',
   '00000000-0000-0000-0000-00000000ca01/0-northwind-case.pdf', 'case', 482000, 0),
  ('00000000-0000-0000-0000-00000000ca01', 'northwind-financials.xlsx',
   '00000000-0000-0000-0000-00000000ca01/1-northwind-financials.xlsx', 'data', 91000, 1);
