-- Reference data for local development.
--
-- Competition names come from DESIGN_BRIEF §6, which says explicitly to swap in
-- real ones before this goes to the exec team. French names for the three
-- English-proper-noun competitions are left as the English name rather than
-- invented — confirm them with the exec team, do not guess.
--
-- Delegates are deliberately NOT seeded here. They arrive through magic-link
-- sign-in, which creates the auth.users row and fires handle_new_user(). The
-- 120-delegate volume test that HANDOFF §9 asks for belongs in Phase 4, where it
-- can exercise the signing matrix it exists to stress.

insert into disciplines (name_en, name_fr, sort_order) values
  ('Finance',                      'Finance',                                    1),
  ('Marketing',                    'Marketing',                                  2),
  ('Strategy',                     'Stratégie',                                  3),
  ('Accounting',                   'Comptabilité',                               4),
  ('MIS',                          'Systèmes d''information de gestion',         5),
  ('Human Resources',              'Ressources humaines',                        6),
  ('Entrepreneurship',             'Entrepreneuriat',                            7),
  ('International Business',       'Commerce international',                     8),
  ('Operations & Supply Chain',    'Opérations et chaîne d''approvisionnement',  9),
  ('Business Analytics',           'Analytique d''affaires',                    10),
  ('Sustainability',               'Développement durable',                     11);

insert into competitions (name_en, name_fr, season_year, starts_on, ends_on, location, status) values
  ('Happening Marketing',                      'Happening Marketing',                      2027, '2026-11-14', '2026-11-15', 'Montréal, QC',        'planned'),
  ('Jeux du Commerce Central',                 'Jeux du Commerce Central',                 2027, '2027-01-08', '2027-01-10', 'Trois-Rivières, QC',  'planned'),
  ('MTBI',                                     'MTBI',                                     2027, '2027-02-06', '2027-02-07', 'Montréal, QC',        'planned'),
  ('Inter-Collegiate Business Competition',    'Inter-Collegiate Business Competition',    2027, '2027-03-05', '2027-03-07', 'Kingston, ON',        'planned'),
  ('John Molson Undergraduate Case Competition','John Molson Undergraduate Case Competition',2027,'2027-03-19', '2027-03-21', 'Montréal, QC',        'planned');

-- A handful of JDCC teams so the shell has real rows to render against.
insert into teams (competition_id, discipline_id, name)
select c.id, d.id, d.name_en
from competitions c
join disciplines d on d.name_en in ('Marketing', 'Strategy', 'Finance', 'Operations & Supply Chain')
where c.name_en = 'Jeux du Commerce Central';


-- ── Bootstrapping the first superuser ────────────────────────────────────────
-- handle_new_user() deliberately grants no role, so the first sign-in lands an
-- authenticated user with no permissions. That is correct: self-service role
-- assignment is exactly the hole this schema closes.
--
-- Sign in once through the app, then run this against the database as the
-- service role (SQL editor in the Supabase dashboard, or psql):
--
--   insert into user_roles (user_id, role)
--   select id, 'superuser' from profiles where email = 'you@example.com';
--
-- From then on, role grants happen through the admin console in Phase 7.
