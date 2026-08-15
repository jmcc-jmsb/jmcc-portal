-- Phase 4: the documents JMCC has to collect, and the coaching layer that makes
-- the portal worth keeping year over year.

-- ── Documents ────────────────────────────────────────────────────────────────
-- The portal is the tracker; DocuSeal is the signing engine (DESIGN_BRIEF §5.3).
-- Nothing here stores a signature — only where one lives and whether it arrived.
create table document_templates (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_fr text not null,
  description text,
  docuseal_template_id text not null,
  sort_order int,
  is_active boolean not null default true
);

create table document_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references document_templates on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  docuseal_submission_id text,
  docuseal_slug text,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'signed')),
  due_at timestamptz,
  signed_at timestamptz,
  signed_pdf_path text,
  assigned_by uuid references profiles,
  created_at timestamptz not null default now(),
  -- One assignment of a template per person. The webhook is at-least-once
  -- (HANDOFF §7), so it matches on docuseal_submission_id and this keeps a retry
  -- from creating a second row for the same signature.
  unique (template_id, user_id)
);

create unique index document_assignments_submission_idx
  on document_assignments (docuseal_submission_id)
  where docuseal_submission_id is not null;

create index document_assignments_user_idx on document_assignments (user_id, status);

-- Assignment creates a locked signing task per person. Re-assigning the same
-- document must update that task rather than stack a second one on the
-- delegate's list, so the upsert needs something to conflict on. Partial,
-- because an unlinked personal task has no such uniqueness to respect.
create unique index tasks_linked_idx
  on tasks (owner_id, linked_type, linked_id)
  where linked_type is not null;


-- ── Feedback ─────────────────────────────────────────────────────────────────
create table feedback_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles on delete cascade,
  subject_user_id uuid references profiles on delete cascade,
  subject_team_id uuid references teams on delete cascade,
  competition_id uuid references competitions on delete set null,
  note_type text not null default 'coach_note'
    check (note_type in ('coach_note', 'self_reflection')),
  body text not null,
  -- Four axes scored 1–5: Content, Delivery, Q&A, Teamwork (DESIGN_BRIEF §5.6).
  rubric jsonb,
  visibility text not null default 'shared'
    check (visibility in ('shared', 'internal', 'private')),
  created_at timestamptz not null default now(),

  constraint has_a_subject check (subject_user_id is not null or subject_team_id is not null),
  -- A self-reflection is by definition about yourself and for yourself. Without
  -- this, "self_reflection" would be a label a coach could apply to a note about
  -- someone else, and the private visibility would stop meaning anything.
  constraint self_reflection_is_private check (
    note_type <> 'self_reflection'
    or (visibility = 'private' and subject_user_id = author_id)
  )
);

create index feedback_notes_subject_idx on feedback_notes (subject_user_id, created_at desc);
create index feedback_notes_team_idx on feedback_notes (subject_team_id, created_at desc);


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table document_templates enable row level security;
alter table document_assignments enable row level security;
alter table feedback_notes enable row level security;

-- The catalog of what JMCC asks people to sign is not sensitive.
create policy templates_read on document_templates
  for select to authenticated using (true);

create policy templates_write on document_templates
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

-- Your own documents, and an executive's matrix over everyone's. A coach is
-- deliberately not included: waivers and medical forms are an administrative
-- matter between the delegate and the executive, and a coach seeing who has not
-- signed their medical form is not coaching information.
create policy assignments_read on document_assignments
  for select
  using (user_id = auth.uid() or is_exec(auth.uid()));

create policy assignments_write on document_assignments
  for all using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

/**
 * HANDOFF §5, policy 3 of the four that carry real risk.
 *
 * The requirement is stronger than "a delegate cannot read internal notes": the
 * brief says a delegate must not be able to *infer that one exists*. That rules
 * out returning the row at all — no count, no id, no gap in a sequence. RLS
 * returning zero rows is the only version of this that holds, because any UI
 * that filters after the fact has already been handed the fact.
 *
 * `private` is handled first and separately. A self-reflection is a delegate
 * writing to themselves; an executive reading those would make the feature
 * useless the first time anyone found out, so `is_exec` deliberately does not
 * reach it.
 */
create policy notes_read on feedback_notes
  for select
  using (
    case visibility
      when 'private' then author_id = auth.uid()
      else
        author_id = auth.uid()
        or is_exec(auth.uid())
        or (subject_user_id = auth.uid() and visibility = 'shared')
        or (
          visibility = 'internal'
          and (
            subject_team_id in (select my_coached_team_ids(auth.uid()))
            or subject_user_id in (select my_coached_user_ids(auth.uid()))
          )
        )
    end
  );

-- A coach writes about their own delegates; a delegate writes only their own
-- self-reflections; an executive writes anywhere. Always as themselves — an
-- author_id someone else chose is a forged note.
create policy notes_insert on feedback_notes
  for insert
  with check (
    author_id = auth.uid()
    and (
      is_exec(auth.uid())
      or (
        note_type = 'self_reflection'
        and subject_user_id = auth.uid()
      )
      or (
        note_type = 'coach_note'
        and (
          subject_user_id in (select my_coached_user_ids(auth.uid()))
          or subject_team_id in (select my_coached_team_ids(auth.uid()))
        )
      )
    )
  );

-- You may edit and delete what you wrote. An executive may not rewrite a coach's
-- note: this is a record of what was said, and the exec aggregate view (§5.6) is
-- about coverage, not content.
create policy notes_update on feedback_notes
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy notes_delete on feedback_notes
  for delete using (author_id = auth.uid());


-- ── Coverage, without exposing content ───────────────────────────────────────
/**
 * The executive aggregate from DESIGN_BRIEF §5.6: which delegates have received
 * feedback and which have not, before a competition.
 *
 * Returns counts only — never a body, never a rubric. An executive can already
 * read shared and internal notes through the policy above; what this adds is the
 * ability to answer "who has been missed" without paging through everyone's
 * coaching notes to work it out.
 *
 * Self-reflections are excluded from the count. A delegate writing to themselves
 * is not coverage, and counting it would let a coach look diligent because their
 * delegates journal.
 */
create or replace function feedback_coverage(competition uuid default null)
returns table (user_id uuid, display_name text, note_count int, last_note_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(p.preferred_name, ''), p.full_name),
    count(n.id)::int,
    max(n.created_at)
  from profiles p
  left join feedback_notes n
    on n.subject_user_id = p.id
   and n.note_type = 'coach_note'
   and (competition is null or n.competition_id = competition)
  where is_exec(auth.uid())
  group by p.id, p.preferred_name, p.full_name
  order by count(n.id), coalesce(nullif(p.preferred_name, ''), p.full_name);
$$;

/**
 * A delegate's own document progress — "3 of 5 documents complete" (§5.3).
 *
 * A plain count over document_assignments would do this, and it is here so the
 * number and the checklist cannot disagree: both read the same definition of
 * what counts as done.
 */
create or replace function my_document_progress()
returns table (total int, signed int)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int,
    count(*) filter (where a.status = 'signed')::int
  from document_assignments a
  where a.user_id = auth.uid();
$$;


-- ── Storage ──────────────────────────────────────────────────────────────────
-- Executed PDFs. Private, fetched server-side by the webhook and handed out only
-- as short-lived signed URLs, same as case materials.
insert into storage.buckets (id, name, public)
values ('signed-documents', 'signed-documents', false)
on conflict (id) do nothing;
