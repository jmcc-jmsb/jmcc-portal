-- The cabinet catalog: the prototype's 26 entries, resolved into 22 piece types.
--
-- PHASE_0_NOTES §2, approved by the exec. Eight of the export's 26 were not
-- pieces but *awards* — a piece bound to a competition or a year. "1st · JDCC"
-- and "1st · JMUCC" are one piece earned twice, and "Season 2024–25" through
-- "Season 2027–28" are one piece earned four times. Keeping them as catalog rows
-- meant adding rows every time JMCC added a competition or a September, and the
-- "N of 26" headline would climb with them — so a returning delegate's cabinet
-- would read emptier the longer they stayed.
--
-- Applied separately from seed.sql because this is a catalog, not sample data:
-- it belongs in production, and it is the one thing here that HANDOFF §13 sends
-- to the exec for sign-off. Re-running it is safe.

insert into cabinet_pieces
  (code, name_en, name_fr, category, unlock_hint_en, unlock_hint_fr,
   is_secret, is_repeatable, tone, shape, sort_order)
values
  -- Placements. All repeatable: you can win at more than one competition, and
  -- the award row is what records which.
  ('place_1st', 'First place', 'Première place', 'placement',
   'Win a discipline', 'Gagner une discipline', false, true, 'gold', 'disc', 1),
  ('place_2nd', 'Second place', 'Deuxième place', 'placement',
   'Place second in a discipline', 'Terminer deuxième dans une discipline', false, true, 'sand', 'disc', 2),
  ('place_3rd', 'Third place', 'Troisième place', 'placement',
   'Place third in a discipline', 'Terminer troisième dans une discipline', false, true, 'sand', 'disc', 3),
  ('place_finalist', 'Finalist', 'Finaliste', 'placement',
   'Reach a final', 'Atteindre une finale', false, true, 'sand', 'diamond', 4),
  ('place_three_podiums', 'Three podiums, one season', 'Trois podiums, une saison', 'placement',
   'Podium three times in a season', 'Monter sur le podium trois fois en une saison', false, true, 'gold', 'diamond', 5),

  -- One season piece, earned once per season. The export listed four; a fifth
  -- would have been a migration every September.
  ('season_complete', 'Season completed', 'Saison complétée', 'season',
   'Complete a season', 'Compléter une saison', false, true, 'sand', 'bar', 1),

  -- Milestones are firsts, so none of them repeat.
  ('ms_first_submission', 'First case submitted', 'Premier cas soumis', 'milestone',
   'Submit your first case', 'Soumettre votre premier cas', false, false, 'sand', 'diamond', 1),
  ('ms_first_competition', 'First competition', 'Première compétition', 'milestone',
   'Compete once', 'Compétitionner une fois', false, false, 'sand', 'diamond', 2),
  ('ms_three_disciplines', 'Three disciplines', 'Trois disciplines', 'milestone',
   'Compete in a third discipline', 'Compétitionner dans une troisième discipline', false, false, 'sand', 'diamond', 3),
  ('ms_ten_practice_cases', 'Ten practice cases', 'Dix cas pratiques', 'milestone',
   'Finish ten practice cases', 'Terminer dix cas pratiques', false, false, 'sand', 'bar', 4),
  ('ms_delivered_live', 'Delivered live', 'Présentation devant jury', 'milestone',
   'Present to a live jury', 'Présenter devant un jury', false, false, 'sand', 'diamond', 5),
  ('ms_travelled', 'Travelled with the delegation', 'Voyage avec la délégation', 'milestone',
   'Travel to a competition', 'Voyager pour une compétition', false, false, 'sand', 'bar', 6),
  ('ms_case_captain', 'Case captain', 'Capitaine de cas', 'milestone',
   'Lead a discipline case team', 'Diriger une équipe de cas', false, false, 'gold', 'diamond', 7),
  ('ms_practice_hours', 'Twenty-five practice hours', 'Vingt-cinq heures de pratique', 'milestone',
   'Log 25 practice hours', 'Cumuler 25 heures de pratique', false, false, 'sand', 'bar', 8),
  ('ms_cross_discipline', 'Cross-discipline sub', 'Remplacement interdisciplinaire', 'milestone',
   'Step in for another discipline', 'Remplacer dans une autre discipline', false, false, 'sand', 'diamond', 9),
  ('ms_orientation', 'Orientation complete', 'Orientation complétée', 'milestone',
   'Finish September orientation', 'Compléter l''orientation de septembre', false, false, 'sand', 'bar', 10),

  -- Commendations. The first four recur season to season; the last two are the
  -- unlabelled silhouettes DESIGN_BRIEF §5.8 asks for.
  ('com_coaches_pick', 'Coach''s pick', 'Choix du coach', 'commendation',
   'Nominated by your coach', 'Nommé par votre coach', false, true, 'gold', 'disc', 1),
  ('com_most_improved', 'Most improved', 'Progression la plus marquée', 'commendation',
   'Nominated by your coach', 'Nommé par votre coach', false, true, 'gold', 'disc', 2),
  ('com_team_captain', 'Team captain', 'Capitaine d''équipe', 'commendation',
   'Named captain by your discipline', 'Nommé capitaine par votre discipline', false, true, 'gold', 'diamond', 3),
  ('com_peer_mentor', 'Peer mentor', 'Mentor', 'commendation',
   'Mentor a first-year delegate', 'Accompagner un délégué de première année', false, true, 'sand', 'bar', 4),
  ('com_wolf_pin', 'Wolf pin', 'Épinglette du loup', 'commendation',
   null, null, true, false, 'gold', 'disc', 5),
  ('com_alumni_crest', 'Alumni crest', 'Écusson des anciens', 'commendation',
   null, null, true, false, 'gold', 'diamond', 6)
on conflict (code) do nothing;
