// ABOUTME: Pure vault logic — which of the five states a case is in, and how its clock reads.
// ABOUTME: No React, no fetch, no Date.now(): every function takes `now` so it can be tested and so it uses server time.
export const VAULT_STATES = ['sealed', 'open', 'submission', 'submitted', 'closed'] as const;
export type VaultState = (typeof VAULT_STATES)[number];

/** DESIGN_BRIEF §5.7 state 3: "the final interval" the timer bar warns in. */
export const FINAL_INTERVAL_MS = 60 * 60 * 1000;

/** Case timing displays in Montreal, always, with the zone shown. HANDOFF §6. */
export const CASE_TIME_ZONE = 'America/Montreal';

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

/**
 * Format dates as Canadian, not as generic English or generic French.
 *
 * The app's locale is 'en' or 'fr', and bare 'fr' makes Intl render the zone as
 * "UTC−4" — correct, but not what anyone in Montreal calls it. 'fr-CA' gives HAE
 * and HNE, which is what a delegate reads on every other schedule they own.
 */
function canadian(locale: string): string {
  return locale.startsWith('fr') ? 'fr-CA' : 'en-CA';
}

/**
 * The zone abbreviation, derived rather than hardcoded.
 *
 * COMPONENT_MAP flagged this: the prototype prints "EDT" as a literal, so a
 * January competition would display EDT while Montreal is on EST. Asking Intl
 * for the abbreviation of the date in question costs nothing and is right twice
 * a year.
 */
export function zoneAbbreviation(iso: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(canadian(locale), {
    timeZone: CASE_TIME_ZONE,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** "Saturday, 8:00 AM EDT" — the sealed panel's one line of copy. */
export function formatCaseTime(iso: string, locale: string): string {
  const stamp = new Intl.DateTimeFormat(canadian(locale), {
    timeZone: CASE_TIME_ZONE,
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
  return `${stamp} ${zoneAbbreviation(iso, locale)}`;
}

/** Full date and time, for version receipts and the archive. */
export function formatCaseDateTime(iso: string, locale: string): string {
  const stamp = new Intl.DateTimeFormat(canadian(locale), {
    timeZone: CASE_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
  return `${stamp} ${zoneAbbreviation(iso, locale)}`;
}

const ZONE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: CASE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Montreal's offset from UTC at a given instant, in ms. Negative — Montreal is behind. */
export function zoneOffsetMs(instant: number): number {
  const parts = ZONE_PARTS.formatToParts(new Date(instant));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour') % 24, // en-US hour12:false renders midnight as 24 in some ICU versions
    at('minute'),
    at('second'),
  );
  return wallAsUtc - instant;
}

/**
 * Read a `datetime-local` value as Montreal wall time, whatever the device's zone is.
 *
 * HANDOFF §6: "Case timing is the one place where an ambiguous clock is a real
 * failure." A `<input type="datetime-local">` hands back a bare wall time with
 * no zone, and the browser's instinct is to interpret it in the device's zone —
 * so an executive scheduling from Vancouver would set a release three hours off.
 *
 * Resolved twice because the offset depends on the instant we are still solving
 * for: the first pass can land on the wrong side of a DST boundary, the second
 * corrects it.
 */
export function montrealLocalToIso(local: string): string {
  if (!local) return '';
  const wallAsUtc = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(wallAsUtc)) return '';

  let instant = wallAsUtc - zoneOffsetMs(wallAsUtc);
  instant = wallAsUtc - zoneOffsetMs(instant);
  return new Date(instant).toISOString();
}

/** The inverse, for prefilling an input from a stored timestamp. */
export function isoToMontrealLocal(iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return '';
  const wall = new Date(instant + zoneOffsetMs(instant));
  return wall.toISOString().slice(0, 16);
}

/**
 * "2 min ago" — the live team state in the upload panel.
 *
 * DESIGN_BRIEF §5.7 wants this so two teammates do not race each other at
 * minute 58. Relative rather than absolute because the question being answered
 * is "did someone just do this", not "when exactly".
 */
export function formatRelative(iso: string, now: number, locale: string): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(canadian(locale), { numeric: 'auto', style: 'short' });

  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

/** Bytes as the upload panel states them. Binary units, one decimal past MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
