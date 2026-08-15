// ABOUTME: Montreal time primitives — zone offsets, formatting, and day bucketing.
// ABOUTME: Everything the vault, the calendar and the task list agree on about what "today" means.

/** Every date in this app displays in Montreal, with the zone shown. HANDOFF §6. */
export const TIME_ZONE = 'America/Montreal';

/**
 * Format as Canadian, not as generic English or generic French.
 *
 * The app's locale is 'en' or 'fr', and bare 'fr' makes Intl render the zone as
 * "UTC−4" — correct, but not what anyone in Montreal calls it. 'fr-CA' gives HAE
 * and HNE, which is what a delegate reads on every other schedule they own.
 */
export function canadian(locale: string): string {
  return locale.startsWith('fr') ? 'fr-CA' : 'en-CA';
}

const ZONE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function partsAt(instant: number): Record<string, number> {
  const parts = ZONE_PARTS.formatToParts(new Date(instant));
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value);
  // en-US with hour12:false renders midnight as 24 in some ICU versions.
  out.hour = out.hour % 24;
  return out;
}

/** Montreal's offset from UTC at a given instant, in ms. Negative — Montreal is behind. */
export function zoneOffsetMs(instant: number): number {
  const p = partsAt(instant);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant;
}

/** The zone abbreviation, derived rather than hardcoded, so January reads EST and July EDT. */
export function zoneAbbreviation(iso: string | number, locale: string): string {
  const parts = new Intl.DateTimeFormat(canadian(locale), {
    timeZone: TIME_ZONE,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/**
 * Read a `datetime-local` value as Montreal wall time, whatever the device's zone is.
 *
 * A `<input type="datetime-local">` hands back a bare wall time with no zone, and
 * the browser's instinct is to interpret it in the device's zone — so an
 * executive scheduling from Vancouver would set a release three hours off.
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
  return new Date(instant + zoneOffsetMs(instant)).toISOString().slice(0, 16);
}

/**
 * "2027-01-16" for an instant, as Montreal saw it.
 *
 * The calendar and the task list both need "same day?" and neither can ask the
 * device: a delegate in Vancouver at 10pm is already on tomorrow's date locally
 * while the deadline they are looking at is still today in Montreal.
 */
export function montrealDayKey(instant: number | string): string {
  const p = partsAt(typeof instant === 'string' ? Date.parse(instant) : instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Midnight in Montreal, as an epoch instant. */
export function startOfMontrealDay(instant: number): number {
  return Date.parse(`${montrealDayKey(instant)}T00:00:00Z`) - zoneOffsetMs(instant);
}

/** Days from a day key, positive when `key` is in the future. Calendar-day arithmetic, not 24h maths. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Monday-first weekday index for a day key. 0 = Monday. */
export function weekdayIndex(key: string): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function formatDateTime(iso: string, locale: string): string {
  const stamp = new Intl.DateTimeFormat(canadian(locale), {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
  return `${stamp} ${zoneAbbreviation(iso, locale)}`;
}

export function formatTimeOnly(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(canadian(locale), {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDayLabel(key: string, locale: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(canadian(locale), {
    timeZone: 'UTC', // the key is already Montreal's calendar day
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(new Date(`${key}T00:00:00Z`));
}

/** "2 min ago". Relative because the question is "did this just happen", not "when exactly". */
export function formatRelative(iso: string, now: number, locale: string): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(canadian(locale), { numeric: 'auto', style: 'short' });

  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}
