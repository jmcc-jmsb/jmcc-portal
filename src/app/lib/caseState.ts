// ABOUTME: Pure vault logic — which of the five states a case is in, and how its clock reads.
// ABOUTME: No React, no fetch, no Date.now(): every function takes `now` so it can be tested and so it uses server time.
import {
  TIME_ZONE,
  canadian,
  formatDateTime,
  zoneAbbreviation,
} from './time';

export { formatRelative, isoToMontrealLocal, montrealLocalToIso, zoneAbbreviation, zoneOffsetMs } from './time';

export const VAULT_STATES = ['sealed', 'open', 'submission', 'submitted', 'closed'] as const;
export type VaultState = (typeof VAULT_STATES)[number];

/** DESIGN_BRIEF §5.7 state 3: "the final interval" the timer bar warns in. */
export const FINAL_INTERVAL_MS = 60 * 60 * 1000;

/** Case timing displays in Montreal, always, with the zone shown. HANDOFF §6. */
export const CASE_TIME_ZONE = TIME_ZONE;

export type CaseTiming = {
  released: boolean;
  releaseAt: string;
  submissionOpensAt: string;
  submissionClosesAt: string;
  hasSubmission: boolean;
};

/**
 * The five states, derived in one place.
 *
 * Order matters more than it looks. `closed` is checked before `submitted`
 * because a team that submitted and then watched the window close is looking at
 * an archive, not at a confirmation — and `submitted` is checked before
 * `submission` so that a team with a version in already sees its receipt rather
 * than an empty upload panel.
 */
export function deriveState(timing: CaseTiming, now: number): VaultState {
  if (!timing.released) return 'sealed';
  if (now >= Date.parse(timing.submissionClosesAt)) return 'closed';
  if (timing.hasSubmission) return 'submitted';
  if (now >= Date.parse(timing.submissionOpensAt)) return 'submission';
  return 'open';
}

/** Whether the upload panel accepts anything right now. The server decides again. */
export function canSubmit(timing: CaseTiming, now: number): boolean {
  return (
    timing.released &&
    now >= Date.parse(timing.submissionOpensAt) &&
    now < Date.parse(timing.submissionClosesAt)
  );
}

/** What the big countdown counts down to in each state. */
export function countdownTarget(timing: CaseTiming, now: number): string | null {
  const state = deriveState(timing, now);
  if (state === 'sealed') return timing.releaseAt;
  if (state === 'closed') return null;
  return timing.submissionClosesAt;
}

export function isFinalInterval(timing: CaseTiming, now: number): boolean {
  const remaining = Date.parse(timing.submissionClosesAt) - now;
  return remaining > 0 && remaining <= FINAL_INTERVAL_MS;
}

export type Duration = { days: number; hours: number; minutes: number; seconds: number };

/** Clamped at zero: a countdown that has run out reads 0, never a negative. */
export function splitDuration(ms: number): Duration {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * The work window the exec form shows live while scheduling ("Delegates get
 * 5h 30m"). Measured from release to close, because that is the time a delegate
 * actually has the case in hand.
 */
export function workWindowMs(releaseAt: string, closesAt: string): number {
  const release = Date.parse(releaseAt);
  const close = Date.parse(closesAt);
  if (Number.isNaN(release) || Number.isNaN(close)) return NaN;
  return close - release;
}

/**
 * "5h 30m", "2d 4h", "45m".
 *
 * Two units is the most anyone reads off a countdown, and the largest unit
 * present always leads.
 */
export function formatDuration(ms: number, units: { d: string; h: string; m: string; s: string }): string {
  const { days, hours, minutes, seconds } = splitDuration(ms);
  if (days > 0) return `${days}${units.d} ${hours}${units.h}`;
  if (hours > 0) return `${hours}${units.h} ${minutes}${units.m}`;
  if (minutes > 0) return `${minutes}${units.m} ${seconds}${units.s}`;
  return `${seconds}${units.s}`;
}

/** "Saturday, 8:00 AM EST" — the sealed panel's one line of copy. */
export function formatCaseTime(iso: string, locale: string): string {
  const stamp = new Intl.DateTimeFormat(canadian(locale), {
    timeZone: TIME_ZONE,
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
  return `${stamp} ${zoneAbbreviation(iso, locale)}`;
}

/** Full date and time, for version receipts and the archive. */
export function formatCaseDateTime(iso: string, locale: string): string {
  return formatDateTime(iso, locale);
}

/** Bytes as the upload panel states them. Binary units, one decimal past MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
