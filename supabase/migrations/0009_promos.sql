-- Phase 7: internal promotion. JMCC marketing its own events to its own members
-- (DESIGN_BRIEF §5.9) — not third-party advertising, and not a feed.

create table promos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  hook text,
  image_path text,
  cta_label text,
  cta_url text,
  event_id uuid references events on delete set null,
  audience_type text not null default 'everyone'
    check (audience_type in ('everyone', 'competition', 'team', 'role')),
  audience_ref text,
  competition_id uuid references competitions on delete cascade,
  display_from timestamptz not null default now(),
  display_until timestamptz,
  created_by uuid references profiles,
  created_at timestamptz not null default now(),

  constraint display_window check (display_until is null or display_until > display_from),
  -- A CTA is a label and a destination or neither. Half of one renders as a
  -- button that goes nowhere, which is worse than no button.
  constraint cta_is_whole check (
    (cta_label is null and cta_url is null) or (cta_label is not null and cta_url is not null)
  )
);

create table promo_dismissals (
  promo_id uuid references promos on delete cascade,
  user_id uuid references profiles on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (promo_id, user_id)
);

create index promos_window_idx on promos (display_from, display_until);

alter table promos enable row level security;
alter table promo_dismissals enable row level security;

-- Reuses the same audience shape as events, so "everyone in the competition"
-- means the same thing in both places.
create or replace function promo_in_audience(p promos, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p.audience_type
    when 'everyone' then true
    when 'competition' then is_exec(uid) or exists (
      select 1 from teams t
      where t.competition_id = p.competition_id
        and (t.id in (select my_team_ids(uid)) or t.id in (select my_coached_team_ids(uid)))
    )
    when 'team' then is_exec(uid)
      or p.audience_ref::uuid in (select my_team_ids(uid))
      or p.audience_ref::uuid in (select my_coached_team_ids(uid))
    when 'role' then is_exec(uid) or has_role(uid, p.audience_ref::app_role)
    else false
  end;
$$;

create policy promos_read on promos
  for select using (promo_in_audience(promos, auth.uid()));

-- Split per command rather than FOR ALL. A FOR ALL policy's `using` clause also
-- applies to SELECT and policies are OR'd — that is how 0007 nearly granted
-- every executive read access to every direct message. Not repeating it.
create policy promos_insert on promos
  for insert with check (is_exec(auth.uid()));

create policy promos_update on promos
  for update using (is_exec(auth.uid())) with check (is_exec(auth.uid()));

create policy promos_delete on promos
  for delete using (is_exec(auth.uid()));

create policy dismissals_read on promo_dismissals
  for select using (user_id = auth.uid());

create policy dismissals_write on promo_dismissals
  for insert with check (user_id = auth.uid());

/**
 * The single promo to show this caller, or nothing.
 *
 * DESIGN_BRIEF §5.9: "never more than one promo card visible per screen; it's
 * dismissible". One slot is a rule, so it is expressed as a function that
 * returns at most one row rather than a list the client is trusted to slice —
 * a client that renders two is then impossible rather than merely wrong.
 *
 * Newest first among what is eligible, so a promo published today outranks one
 * that has been running for a month.
 */
create or replace function active_promo()
returns table (
  id uuid,
  title text,
  hook text,
  image_path text,
  cta_label text,
  cta_url text,
  event_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.title, p.hook, p.image_path, p.cta_label, p.cta_url, p.event_id
  from promos p
  where promo_in_audience(p, auth.uid())
    and now() >= p.display_from
    and (p.display_until is null or now() < p.display_until)
    and not exists (
      select 1 from promo_dismissals d
      where d.promo_id = p.id and d.user_id = auth.uid()
    )
  order by p.display_from desc
  limit 1;
$$;


-- ── Promo images ─────────────────────────────────────────────────────────────
-- Public, unlike every other bucket here: a promo image is marketing for an
-- event JMCC wants attended, and a signed URL that expires mid-scroll would be
-- a broken image for no benefit.
insert into storage.buckets (id, name, public)
values ('promo-images', 'promo-images', true)
on conflict (id) do nothing;
