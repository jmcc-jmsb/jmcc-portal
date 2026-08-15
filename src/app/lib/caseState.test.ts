// ABOUTME: Unit tests for the vault's pure logic — state derivation, countdowns, and clock display.
// ABOUTME: The database tests cover who may see a case; these cover what the screen does about it.
import { describe, expect, it } from 'vitest';
import {
  canSubmit,
  countdownTarget,
  deriveState,
  formatBytes,
  formatCaseTime,
  formatDuration,
  isFinalInterval,
  isoToMontrealLocal,
  montrealLocalToIso,
  splitDuration,
  workWindowMs,
  zoneAbbreviation,
} from './caseState';
import type { CaseTiming } from './caseState';

const UNITS = { d: 'd', h: 'h', m: 'm', s: 's' };

/** 8:00 AM Saturday in Montreal, in the middle of the summer. */
const RELEASE = '2027-01-16T13:00:00.000Z';
const OPENS = '2027-01-16T13:00:00.000Z';
const CLOSES = '2027-01-16T18:30:00.000Z';

function timing(overrides: Partial<CaseTiming> = {}): CaseTiming {
  return {
    released: true,
    releaseAt: RELEASE,
    submissionOpensAt: OPENS,
    submissionClosesAt: CLOSES,
    hasSubmission: false,
    ...overrides,
  };
}

describe('deriveState', () => {
  it('is sealed whenever the server says it is not released, whatever the clock says', () => {
    // The point of taking `released` from the server: a device clock past the
    // release time does not open the vault.
    const past = Date.parse(CLOSES) + 1;
    expect(deriveState(timing({ released: false }), past)).toBe('sealed');
  });

  it('is open once released but before submissions open', () => {
    const t = timing({ submissionOpensAt: '2027-01-16T16:00:00.000Z' });
    expect(deriveState(t, Date.parse(RELEASE) + 1000)).toBe('open');
  });

  it('is submission once the window opens', () => {
    expect(deriveState(timing(), Date.parse(OPENS) + 1000)).toBe('submission');
  });

  it('is submitted once a version is in, even though the window is still open', () => {
    const t = timing({ hasSubmission: true });
    expect(deriveState(t, Date.parse(OPENS) + 1000)).toBe('submitted');
  });

  it('is closed after the deadline even for a team that submitted', () => {
    const t = timing({ hasSubmission: true });
    expect(deriveState(t, Date.parse(CLOSES))).toBe('closed');
  });

  it('treats the closing instant as closed, not as the last submittable moment', () => {
    expect(canSubmit(timing(), Date.parse(CLOSES))).toBe(false);
    expect(canSubmit(timing(), Date.parse(CLOSES) - 1)).toBe(true);
  });

  it('does not let a sealed case be submitted to', () => {
    expect(canSubmit(timing({ released: false }), Date.parse(OPENS) + 1000)).toBe(false);
  });
});

describe('countdownTarget', () => {
  it('counts to release while sealed, and to the deadline once open', () => {
    expect(countdownTarget(timing({ released: false }), 0)).toBe(RELEASE);
    expect(countdownTarget(timing(), Date.parse(OPENS) + 1)).toBe(CLOSES);
  });

  it('has nothing to count once the case is closed', () => {
    expect(countdownTarget(timing(), Date.parse(CLOSES) + 1)).toBeNull();
  });
});

describe('isFinalInterval', () => {
  it('warns inside the last hour and not before it', () => {
    const close = Date.parse(CLOSES);
    expect(isFinalInterval(timing(), close - 61 * 60 * 1000)).toBe(false);
    expect(isFinalInterval(timing(), close - 59 * 60 * 1000)).toBe(true);
  });

  it('stops warning once the deadline has passed — that is a different state', () => {
    expect(isFinalInterval(timing(), Date.parse(CLOSES) + 1)).toBe(false);
  });
});

describe('splitDuration', () => {
  it('clamps a passed deadline to zero rather than counting up', () => {
    expect(splitDuration(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('splits a duration into whole units', () => {
    expect(splitDuration(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
  });
});

describe('formatDuration', () => {
  it('leads with the largest unit present and shows two', () => {
    expect(formatDuration(5.5 * 3600 * 1000, UNITS)).toBe('5h 30m');
    expect(formatDuration(28 * 3600 * 1000, UNITS)).toBe('1d 4h');
    expect(formatDuration(45 * 60 * 1000 + 30_000, UNITS)).toBe('45m 30s');
    expect(formatDuration(9000, UNITS)).toBe('9s');
  });
});

describe('workWindowMs', () => {
  it('measures from release to close — the time a delegate has the case', () => {
    expect(formatDuration(workWindowMs(RELEASE, CLOSES), UNITS)).toBe('5h 30m');
  });

  it('is NaN for an unset field, so the form can stay quiet instead of showing a wrong number', () => {
    expect(Number.isNaN(workWindowMs('', CLOSES))).toBe(true);
  });

  it('goes negative when the deadline precedes the release, which is the mis-set clock the label exists to catch', () => {
    expect(workWindowMs(CLOSES, RELEASE)).toBeLessThan(0);
  });
});

describe('timezone', () => {
  /* COMPONENT_MAP flagged the prototype's hardcoded "EDT". January in Montreal
     is EST, and a case scheduled for JDCC in January would have displayed the
     wrong zone every time. */
  it('derives EST in January and EDT in July rather than hardcoding either', () => {
    expect(zoneAbbreviation('2027-01-16T13:00:00.000Z', 'en-CA')).toBe('EST');
    expect(zoneAbbreviation('2027-07-16T13:00:00.000Z', 'en-CA')).toBe('EDT');
  });

  it('uses the Quebec abbreviations in French rather than "UTC−4"', () => {
    // Bare 'fr' renders the zone as an offset, which is correct and reads
    // foreign on a Montreal schedule. 'fr-CA' is what the app asks Intl for.
    expect(zoneAbbreviation('2027-07-16T13:00:00.000Z', 'fr')).toBe('HAE');
    expect(zoneAbbreviation('2027-01-16T13:00:00.000Z', 'fr')).toBe('HNE');
  });

  it('renders the sealed panel line in Montreal time with the zone shown', () => {
    // 13:00 UTC in January is 08:00 in Montreal.
    const line = formatCaseTime(RELEASE, 'en-CA');
    expect(line).toContain('Saturday');
    expect(line).toContain('8:00');
    expect(line).toContain('EST');
  });
});

describe('montrealLocalToIso', () => {
  /* The failure this prevents: an exec scheduling a release from a laptop still
     on Pacific time, and every delegate getting the case three hours early. */
  it('reads a wall time as Montreal in winter (EST, UTC-5)', () => {
    expect(montrealLocalToIso('2027-01-16T08:00')).toBe('2027-01-16T13:00:00.000Z');
  });

  it('reads a wall time as Montreal in summer (EDT, UTC-4)', () => {
    expect(montrealLocalToIso('2027-07-16T08:00')).toBe('2027-07-16T12:00:00.000Z');
  });

  it('round-trips through the input format', () => {
    expect(isoToMontrealLocal('2027-01-16T13:00:00.000Z')).toBe('2027-01-16T08:00');
    expect(isoToMontrealLocal(montrealLocalToIso('2027-03-20T09:30'))).toBe('2027-03-20T09:30');
  });

  it('lands on the right side of the spring-forward boundary', () => {
    // 2027-03-14 02:00 EST → 03:00 EDT. An hour either side must not collapse.
    expect(montrealLocalToIso('2027-03-14T01:30')).toBe('2027-03-14T06:30:00.000Z');
    expect(montrealLocalToIso('2027-03-14T03:30')).toBe('2027-03-14T07:30:00.000Z');
  });

  it('returns empty for an unset field rather than an epoch date', () => {
    expect(montrealLocalToIso('')).toBe('');
    expect(montrealLocalToIso('nonsense')).toBe('');
  });
});

describe('formatBytes', () => {
  it('states sizes the way the upload panel does', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
