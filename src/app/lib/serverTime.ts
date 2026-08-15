// ABOUTME: Server clock sync — every countdown in the vault reads now() from here, never Date.now().
// ABOUTME: A device clock is a user setting; a deadline is not. HANDOFF §6.
import { useEffect, useState } from 'react';

/** A resync that moves the clock more than this is shown, not applied silently. */
export const DRIFT_THRESHOLD_MS = 30_000;

let offset = 0;
let synced = false;
let pendingDriftMs = 0;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Server time in epoch milliseconds. Equals Date.now() until the first sync. */
export function now(): number {
  return Date.now() + offset;
}

export function isSynced(): boolean {
  return synced;
}

/**
 * Fold a `serverNow` from any response into the offset.
 *
 * Every case response carries one, so the common path costs no extra request —
 * the /api/time endpoint exists for resyncs that have no other reason to talk to
 * the server.
 *
 * The first sync is always applied quietly: a device that was 4 minutes slow
 * before it ever saw a countdown has not drifted, it was simply wrong, and
 * warning about that helps nobody. After that, a jump past the threshold is
 * recorded for the UI to surface.
 */
export function applyServerNow(iso: string): void {
  const serverMs = Date.parse(iso);
  if (Number.isNaN(serverMs)) return;

  const next = serverMs - Date.now();
  const shift = next - offset;

  offset = next;
  if (synced && Math.abs(shift) > DRIFT_THRESHOLD_MS) pendingDriftMs = shift;
  synced = true;
  emit();
}

export function consumeDrift(): number {
  const drift = pendingDriftMs;
  pendingDriftMs = 0;
  return drift;
}

export async function resync(): Promise<void> {
  try {
    const res = await fetch('/api/time', { cache: 'no-store' });
    if (!res.ok) return;
    const body = (await res.json()) as { serverNow?: string };
    if (body.serverNow) applyServerNow(body.serverNow);
  } catch {
    // Offline. The existing offset stays valid — it is a clock difference, not a
    // subscription, and nothing about it expires when the network does.
  }
}

/**
 * Server time, ticking.
 *
 * Resyncs on mount, on reconnect, and when the tab becomes visible again —
 * which is the case that actually matters on a phone, where a backgrounded tab
 * can be frozen for an hour with its timers stopped.
 */
export function useServerNow(tickMs = 1000): { now: number; driftMs: number } {
  const [tick, setTick] = useState(() => now());
  const [driftMs, setDriftMs] = useState(0);

  useEffect(() => {
    const listener = () => {
      setTick(now());
      const drift = consumeDrift();
      if (drift !== 0) setDriftMs(drift);
    };
    listeners.add(listener);

    const interval = window.setInterval(() => setTick(now()), tickMs);
    const onOnline = () => void resync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resync();
    };

    void resync();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      listeners.delete(listener);
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tickMs]);

  return { now: tick, driftMs };
}
