// ABOUTME: Fetching for the vault — cases, materials, monitor — plus the dev fixture behind the state switcher.
// ABOUTME: Every response's serverNow feeds serverTime, so the countdown is corrected by traffic the app was making anyway.
import { useCallback, useEffect, useState } from 'react';
import { PUBLIC_ENABLE_DEV_CONTROLS } from 'astro:env/client';
import { applyServerNow } from './serverTime';
import type { VaultState } from './caseState';

export type VaultCase = {
  id: string;
  competitionId: string;
  disciplineId: string | null;
  /** Null while sealed — the database redacts it, the client never had it to leak. */
  title: string | null;
  description: string | null;
  deliverableFormat: string | null;
  releaseAt: string;
  submissionOpensAt: string;
  submissionClosesAt: string;
  coachVisibility: 'same' | 'early' | 'after';
  coachReleaseAt: string | null;
  audienceType: 'competition' | 'discipline' | 'teams';
  status: 'draft' | 'scheduled' | 'closed';
  forceReleasedAt: string | null;
  released: boolean;
};

type CaseApiRow = {
  id: string;
  competition_id: string;
  discipline_id: string | null;
  title: string | null;
  description: string | null;
  deliverable_format: string | null;
  release_at: string;
  submission_opens_at: string;
  submission_closes_at: string;
  coach_visibility: 'same' | 'early' | 'after';
  coach_release_at: string | null;
  audience_type: 'competition' | 'discipline' | 'teams';
  status: 'draft' | 'scheduled' | 'closed';
  force_released_at: string | null;
  released: boolean;
};

function toCase(row: CaseApiRow): VaultCase {
  return {
    id: row.id,
    competitionId: row.competition_id,
    disciplineId: row.discipline_id,
    title: row.title,
    description: row.description,
    deliverableFormat: row.deliverable_format,
    releaseAt: row.release_at,
    submissionOpensAt: row.submission_opens_at,
    submissionClosesAt: row.submission_closes_at,
    coachVisibility: row.coach_visibility,
    coachReleaseAt: row.coach_release_at,
    audienceType: row.audience_type,
    status: row.status,
    forceReleasedAt: row.force_released_at,
    released: row.released,
  };
}

export type Material = {
  id: string;
  filename: string;
  kind: string;
  sizeBytes: number | null;
  url: string;
};

export type Submission = {
  teamId: string;
  version: number;
  submittedAt: string;
  submittedByName: string;
  files: { name: string; size: number }[];
};

export type Monitor = {
  roster: { team_id: string; team_name: string }[];
  submissions: Submission[];
};

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as T & { serverNow?: string };
  // Any response carrying a server clock is a chance to correct ours.
  if (body.serverNow) applyServerNow(body.serverNow);
  return { ok: res.ok, status: res.status, body };
}

export function useCases(): {
  cases: VaultCase[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [cases, setCases] = useState<VaultCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getJson<{ cases?: CaseApiRow[]; error?: string }>('/api/cases')
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) setError(body.error ?? 'failed');
        else setCases((body.cases ?? []).map(toCase));
      })
      .catch(() => !cancelled && setError('offline'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { cases, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/**
 * Materials for one case.
 *
 * A 403 here is not an error state to apologise for — it is the sealed state,
 * and it is the expected answer for most of a case's life. It carries the
 * release time and nothing else.
 */
export function useMaterials(caseId: string | null): {
  materials: Material[];
  sealed: boolean;
  loading: boolean;
  reload: () => void;
} {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sealed, setSealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setLoading(true);

    getJson<{ materials?: Material[] }>(`/api/cases/${caseId}/materials`)
      .then(({ ok, status, body }) => {
        if (cancelled) return;
        setSealed(status === 403);
        setMaterials(ok ? (body.materials ?? []) : []);
      })
      .catch(() => !cancelled && setMaterials([]))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [caseId, nonce]);

  return { materials, sealed, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function useMonitor(caseId: string | null): Monitor & { reload: () => void } {
  const [monitor, setMonitor] = useState<Monitor>({ roster: [], submissions: [] });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;

    getJson<Monitor>(`/api/cases/${caseId}/monitor`)
      .then(({ ok, body }) => {
        if (cancelled || !ok) return;
        setMonitor({ roster: body.roster ?? [], submissions: body.submissions ?? [] });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [caseId, nonce]);

  return { ...monitor, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/**
 * Pick the case the vault opens on.
 *
 * Anything still live wins over anything finished, and among live cases the one
 * closing soonest is the one a delegate is actually worried about. Falls back to
 * the most recently closed so the screen is never empty for a team mid-season.
 */
export function currentCase(cases: VaultCase[], now: number): VaultCase | null {
  if (cases.length === 0) return null;
  const live = cases
    .filter((c) => now < Date.parse(c.submissionClosesAt))
    .sort((a, b) => Date.parse(a.submissionClosesAt) - Date.parse(b.submissionClosesAt));
  if (live.length > 0) return live[0];

  return [...cases].sort(
    (a, b) => Date.parse(b.submissionClosesAt) - Date.parse(a.submissionClosesAt),
  )[0];
}

/* ── Dev fixture ──────────────────────────────────────────────────────────────
   DESIGN_BRIEF §5.7: "ship a hidden dev control to jump between the five states.
   Reviewers will not wait until Saturday at 8:00 AM to see state 2."

   This is the one place in the app that invents data, and it is gated on the
   same flag as the role switcher. It also makes the whole phase reviewable
   before a Supabase project exists, which is why the timings are relative to
   right now rather than fixed. */
export function fixtureFor(state: VaultState, now: number): {
  vaultCase: VaultCase;
  materials: Material[];
  monitor: Monitor;
} {
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const hour = 3600_000;

  const sealed = state === 'sealed';
  const closed = state === 'closed';

  const releaseAt = sealed ? iso(19 * hour) : iso(-2 * hour);
  const opensAt = sealed ? iso(19 * hour) : state === 'open' ? iso(hour) : iso(-2 * hour);
  const closesAt = closed ? iso(-hour) : state === 'submission' ? iso(0.4 * hour) : iso(3 * hour);

  const vaultCase: VaultCase = {
    id: 'dev-fixture',
    competitionId: 'dev',
    disciplineId: null,
    title: sealed ? null : 'Northwind Logistics: the carve-out',
    description: sealed
      ? null
      : 'Northwind is spinning out its last-mile division. Recommend keep, sell, or partner.',
    deliverableFormat: 'PPTX deck, 15 slides',
    releaseAt,
    submissionOpensAt: opensAt,
    submissionClosesAt: closesAt,
    coachVisibility: 'same',
    coachReleaseAt: null,
    audienceType: 'competition',
    status: closed ? 'closed' : 'scheduled',
    forceReleasedAt: null,
    released: !sealed,
  };

  const materials: Material[] = sealed
    ? []
    : [
        { id: 'm1', filename: 'northwind-case.pdf', kind: 'case', sizeBytes: 482_000, url: '#' },
        { id: 'm2', filename: 'northwind-financials.xlsx', kind: 'data', sizeBytes: 91_000, url: '#' },
        { id: 'm3', filename: 'judging-rubric.pdf', kind: 'rubric', sizeBytes: 42_000, url: '#' },
      ];

  const submitted = state === 'submitted' || closed;
  const monitor: Monitor = {
    roster: [
      { team_id: 'dev-team-1', team_name: 'Finance A' },
      { team_id: 'dev-team-2', team_name: 'Marketing B' },
    ],
    submissions: submitted
      ? [
          {
            teamId: 'dev-team-1',
            version: 2,
            submittedAt: iso(-0.5 * hour),
            submittedByName: 'Marc',
            files: [{ name: 'final_deck.pptx', size: 8_400_000 }],
          },
          {
            teamId: 'dev-team-1',
            version: 1,
            submittedAt: iso(-1.5 * hour),
            submittedByName: 'Dana',
            files: [{ name: 'draft_deck.pptx', size: 7_100_000 }],
          },
        ]
      : [],
  };

  return { vaultCase, materials, monitor };
}

export const devControlsEnabled = Boolean(PUBLIC_ENABLE_DEV_CONTROLS);
