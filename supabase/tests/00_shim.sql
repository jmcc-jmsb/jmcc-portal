-- The parts of a Supabase database that Supabase provides, recreated on stock
-- Postgres so the migrations can be applied and the policies actually exercised.
--
-- This file is NOT a migration and must never be applied to a real project. It
-- exists so that "a delegate cannot read case_materials before release" can be
-- a test that runs, rather than a sentence in a document that everyone believes.

create schema if not exists auth;
create schema if not exists storage;

-- Supabase's real auth.users has ~30 columns; these are the three the schema and
-- the handle_new_user() trigger actually touch.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  raw_user_meta_data jsonb
);

/* auth.uid() as Supabase defines it: the `sub` claim of the verified JWT,
   surfaced to SQL through a request-scoped setting. Tests impersonate a caller
   by setting that same setting, which means they exercise the real policy
   expression rather than a test-only shortcut. */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

-- Supabase ships these; RLS is meaningless without a non-owner role to apply to.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
