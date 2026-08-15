// ABOUTME: The Cases screen — the current case's vault, the exec schedule form, and the past-cases library.
// ABOUTME: Everything time-dependent reads server time, so nothing here moves when a device clock does.
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import { formatCaseDateTime } from '../../lib/caseState';
import { useServerNow } from '../../lib/serverTime';
import { useIsExecLike } from '../../lib/session';
import { currentCase, fixtureFor, useCases, useMaterials, useMonitor } from '../../lib/vaultData';
import VaultStateSwitcher from '../../components/dev/VaultStateSwitcher';
import type { ForcedState } from '../../components/dev/VaultStateSwitcher';
import CaseVault from './CaseVault';
import ScheduleForm from './ScheduleForm';

export default function Cases() {
  const t = useT();
  const { locale } = useLocale();
  const { now, driftMs } = useServerNow();
  const isExecLike = useIsExecLike();

  const [forced, setForced] = useState<ForcedState>(null);
  const [composing, setComposing] = useState(false);

  const { cases, loading, reload } = useCases();
  const real = currentCase(cases, now);

  // With a forced state the vault runs on the fixture and stops fetching, so a
  // reviewer can walk all five states before a Supabase project exists.
  const fixture = forced ? fixtureFor(forced, now) : null;
  const liveId = fixture ? null : (real?.id ?? null);

  const { materials, reload: reloadMaterials } = useMaterials(liveId);
  const monitor = useMonitor(liveId);

  const shown = fixture?.vaultCase ?? real;
  const past = cases.filter((c) => c.id !== shown?.id && now >= Date.parse(c.submissionClosesAt));

  return (
    <div className="flex flex-col">
      {/* HANDOFF §6: a resync that moves the clock more than 30s during an
          active window is surfaced, never applied silently — a countdown that
          jumps without explanation is how a team stops trusting the timer. */}
      {driftMs !== 0 && (
        <p role="status" className="border-b border-gold/40 bg-gold/15 px-4 py-2 text-body text-ink-800">
          {t('vault.clockCorrected')}
        </p>
      )}

      <CaseVaultOrEmpty
        loading={loading}
        forced={forced}
        shown={shown}
        materials={fixture?.materials ?? materials}
        monitor={fixture?.monitor ?? monitor}
        now={now}
        onSubmitted={() => {
          monitor.reload();
          reloadMaterials();
        }}
      />

      <div className="flex flex-col gap-5 px-4 pb-5">
        <VaultStateSwitcher value={forced} onChange={setForced} />

        {isExecLike &&
          (composing ? (
            <ScheduleForm
              onCreated={() => {
                setComposing(false);
                reload();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="min-h-11 self-start rounded-sm border border-primary px-4 text-body font-semibold text-primary"
            >
              {t('schedule.new')}
            </button>
          ))}

        {past.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
              {t('vault.past')}
            </h2>
            <ul className="flex flex-col gap-2">
              {past.map((item) => (
                <li
                  key={item.id}
                  className="rounded-sm border border-muted/20 bg-white px-3 py-2"
                >
                  <p className="text-body font-semibold text-ink">
                    {item.title ?? t('vault.sealedTitle')}
                  </p>
                  <p className="mt-0.5 text-meta text-muted">
                    {formatCaseDateTime(item.submissionClosesAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function CaseVaultOrEmpty({
  loading,
  forced,
  shown,
  materials,
  monitor,
  now,
  onSubmitted,
}: {
  loading: boolean;
  forced: ForcedState;
  shown: ReturnType<typeof currentCase>;
  materials: Parameters<typeof CaseVault>[0]['materials'];
  monitor: Parameters<typeof CaseVault>[0]['monitor'];
  now: number;
  onSubmitted: () => void;
}) {
  const t = useT();

  if (loading && !shown) {
    return (
      <div className="px-4 py-5" role="status" aria-label={t('nav.cases')}>
        <div className="h-6 w-48 rounded-xs bg-muted/20" />
        <div className="mt-3 h-4 w-64 rounded-xs bg-muted/20" />
      </div>
    );
  }

  if (!shown) {
    // No invented data on the real path: a delegate between competitions sees
    // that there is nothing, not a plausible-looking empty case.
    return (
      <div className="px-4 py-5">
        <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.cases')}</h1>
        <p className="mt-3 text-body text-muted">{t('vault.none')}</p>
      </div>
    );
  }

  return (
    <CaseVault
      vaultCase={shown}
      materials={materials}
      monitor={monitor}
      now={now}
      onSubmitted={onSubmitted}
      forcedState={forced}
    />
  );
}
