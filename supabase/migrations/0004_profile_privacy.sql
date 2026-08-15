-- Teammates may know each other's names. They may not know each other's
-- allergies.
--
-- 0002 let teammates read each other's `profiles` row so a roster could render
-- names. RLS is row-level, so that clause also handed over `allergies`,
-- `dietary_restrictions`, `accessibility_needs`, `emergency_contact_name` and
-- `emergency_contact_phone` — health-adjacent and emergency data, to every other
-- delegate on the team. Confirmed by querying it as a teammate, not reasoned
-- about.
--
-- The fix is the same shape as my_cases() in 0003: the row stops being readable,
-- and a definer function returns the columns that were actually wanted.

drop policy profiles_read on profiles;

create policy profiles_read on profiles
  for select
  using (
    id = auth.uid()
    or is_exec(auth.uid())
    -- A coach keeps full access to their own delegates. That is a real decision
    -- rather than an oversight: a coach books the meals and travels with the
    -- team, so dietary and accessibility needs are theirs to act on. Narrow it
    -- to names here too if JMCC would rather that live with the executive.
    or id in (select my_coached_user_ids(auth.uid()))
  );

/**
 * Display names for people the caller is entitled to see named.
 *
 * Names only. This is what the submission monitor uses to say "Marc submitted
 * final_deck.pptx" without giving Marc's teammates anything else about him, and
 * what a team roster should use when Phase 3 builds one.
 *
 * Returns nothing for an id the caller has no relationship to, so it cannot be
 * used to enumerate the organisation one uuid at a time.
 */
create or replace function visible_profile_names(ids uuid[])
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(p.preferred_name, ''), p.full_name)
  from profiles p
  where p.id = any (ids)
    and (
      p.id = auth.uid()
      or is_exec(auth.uid())
      or p.id in (select my_coached_user_ids(auth.uid()))
      -- The teammate relationship that used to live in the policy, now scoped
      -- to the two columns it was ever needed for.
      or exists (
        select 1
        from team_members mine
        join team_members theirs on theirs.team_id = mine.team_id
        where mine.user_id = auth.uid() and theirs.user_id = p.id
      )
    );
$$;
