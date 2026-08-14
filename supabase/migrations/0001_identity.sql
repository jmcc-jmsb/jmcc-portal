-- Identity: profiles, roles, and the RLS helpers every later policy is built on.
-- Forward-only. Never edit this file once it has been applied anywhere.

create type app_role as enum ('superuser', 'executive', 'coach', 'delegate');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  preferred_name text,
  email text not null,
  phone text,
  program text,
  grad_year int,
  pronouns text,
  dietary_restrictions text,
  allergies text,
  accessibility_needs text,
  emergency_contact_name text,
  emergency_contact_phone text,
  tshirt_size text,
  locale text not null default 'en' check (locale in ('en', 'fr')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Roles live in their own table, never as a column on profiles.
--
-- This is the most important decision in the schema. `role` on profiles plus a
-- "users can edit their own profile" policy is a privilege-escalation path: one
-- UPDATE and a delegate is an executive. Separating them means the policy that
-- guards role changes is a different policy from the one that guards a phone
-- number, and only the first is restricted to superusers.
create table user_roles (
  user_id uuid references profiles(id) on delete cascade,
  role app_role not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_user_id_idx on user_roles (user_id);


-- ── Helpers ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER STABLE, with search_path pinned.
--
-- Policies that subquery other tables get slow and can recurse: a policy on
-- user_roles that reads user_roles re-enters its own policy. A definer function
-- reads the table with the owner's rights, so the policy check stops there.
--
-- `set search_path = public` is not decoration. Without it a caller can put a
-- schema of their own in front on the search path and have the definer function
-- resolve `user_roles` to a table they control.

create or replace function has_role(uid uuid, r app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from user_roles where user_id = uid and role = r);
$$;

create or replace function is_exec(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_role(uid, 'executive') or has_role(uid, 'superuser');
$$;

-- The role list for the current caller, for the client to shape its own UI with.
-- Reading it grants nothing; every table still answers through its own policy.
create or replace function my_roles()
returns setof app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid();
$$;


-- ── Profile provisioning ─────────────────────────────────────────────────────
-- Magic-link sign-in creates an auth.users row with no profile behind it. This
-- fills one in so the app never has a signed-in user with nothing to read.
--
-- It deliberately does NOT grant a role. A new sign-in is an authenticated user
-- with no permissions until an exec puts them on a roster; self-service role
-- assignment is the hole this schema exists to close.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table user_roles enable row level security;

-- Read: yourself, or anyone if you are exec. The coach clause needs the teams
-- tables, so 0002 replaces this policy once they exist.
create policy profiles_read on profiles
  for select
  using (id = auth.uid() or is_exec(auth.uid()));

create policy profiles_update_own on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Execs may correct a roster entry, but cannot delete a profile — that would
-- orphan submissions and awards. Deletion is a superuser action through the
-- admin console, cascading from auth.users.
create policy profiles_update_exec on profiles
  for update
  using (is_exec(auth.uid()))
  with check (is_exec(auth.uid()));

-- No insert policy: profiles are created only by handle_new_user(), which runs
-- as definer and bypasses RLS. A client cannot invent a profile row.

create policy roles_read on user_roles
  for select
  using (user_id = auth.uid() or is_exec(auth.uid()));

-- Writes are superuser-only, and `with check` matters as much as `using`:
-- without it an executive could insert a row they would then be unable to see.
create policy roles_write on user_roles
  for all
  using (has_role(auth.uid(), 'superuser'))
  with check (has_role(auth.uid(), 'superuser'));
