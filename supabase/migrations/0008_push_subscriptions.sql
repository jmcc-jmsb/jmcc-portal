-- Web push subscriptions. HANDOFF §4 and §8.
--
-- A subscription is a capability: whoever holds the endpoint and keys can send a
-- notification to that device. So it is readable only by its owner, and sending
-- happens on the secret key from a server endpoint — never from a browser.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- One row per device. A browser re-subscribing after a permission reset gets
  -- the same endpoint back, and a duplicate would mean two notifications.
  unique (endpoint)
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Your own devices only. Deliberately not readable by exec: an executive has no
-- reason to enumerate which devices a delegate carries, and the send endpoint
-- runs on the secret key, which does not consult this policy.
create policy push_read_own on push_subscriptions
  for select using (user_id = auth.uid());

create policy push_write_own on push_subscriptions
  for insert with check (user_id = auth.uid());

create policy push_delete_own on push_subscriptions
  for delete using (user_id = auth.uid());

-- No update policy. A subscription is replaced, not edited: the endpoint is the
-- identity, and changing it in place would mean pointing an existing row at a
-- different device.
