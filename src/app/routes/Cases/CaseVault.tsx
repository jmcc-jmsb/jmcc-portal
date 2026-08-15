// ABOUTME: The signature screen — one case, rendered in whichever of the five states it is in.
// ABOUTME: The five states share chrome and differ in one panel, so they live together rather than in five near-copies.
import { useLocale, useT } from '../../i18n';
import { deriveState, canSubmit, formatCaseTime } from '../../lib/caseState';
import type { CaseTiming, VaultState } from '../../lib/caseState';
import { useIsExecLike } from '../../lib/session';
import type { Material, Monitor as MonitorData, VaultCase } from '../../lib/vaultData';
import Materials from './Materials';
import Monitor from './Monitor';
import SubmitPanel from './SubmitPanel';
import TimerBar from './TimerBar';

type Props = {
  vaultCase: VaultCase;
  materials: Material[];
  monitor: MonitorData;
  now: number;
  onSubmitted: () => void;
  /** Dev-only. Forces a state the real data is not in; see VaultStateSwitcher. */
  forcedState?: VaultState | null;
};

export default function CaseVault({
  vaultCase,
  materials,
  monitor,
  now,
  onSubmitted,
  forcedState,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const isExecLike = useIsExecLike();

  const timing: CaseTiming = {
    released: vaultCase.released,
    releaseAt: vaultCase.releaseAt,
    submissionOpensAt: vaultCase.submissionOpensAt,
    submissionClosesAt: vaultCase.submissionClosesAt,
    hasSubmission: monitor.submissions.length > 0,
  };

  const state = forcedState ?? deriveState(timing, now);
  const sealed = state === 'sealed';

  return (
    <div className="flex flex-col">
      <TimerBar timing={timing} now={now} />

      <div className="flex flex-col gap-5 px-4 py-5">
        {sealed ? <SealedPanel releaseAt={vaultCase.releaseAt} /> : null}

        <header>
          <h1 className="font-unbounded text-title font-bold text-primary">
            {/* Withheld while sealed, and withheld in SQL rather than here — the
                client is never sent a title it is not allowed to show. */}
            {vaultCase.title ?? t('vault.sealedTitle')}
          </h1>
          {vaultCase.description && (
            <p className="mt-2 text-body leading-relaxed text-ink">{vaultCase.description}</p>
          )}
          <dl className="mt-3 flex flex-col gap-1">
            {vaultCase.deliverableFormat && (
              <div className="flex gap-2 text-body">
                <dt className="text-muted">{t('vault.deliverable')}</dt>
                <dd className="font-semibold text-ink">{vaultCase.deliverableFormat}</dd>
              </div>
            )}
            <div className="flex gap-2 text-body">
              <dt className="text-muted">{sealed ? t('vault.opens') : t('vault.due')}</dt>
              <dd className="font-semibold text-ink">
                {formatCaseTime(
                  sealed ? vaultCase.releaseAt : vaultCase.submissionClosesAt,
                  locale,
                )}
              </dd>
            </div>
          </dl>
        </header>

        {!sealed && (
          <section className="flex flex-col gap-2">
            <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
              {t('vault.materials')}
            </h2>
            <Materials materials={materials} />
          </section>
        )}

        {/* States 3 and 4. Hidden for exec and coach, who have no submit action
            at all (DESIGN_BRIEF §2) — showing them a disabled upload box would
            imply the permission exists. */}
        {!sealed && !isExecLike && state !== 'open' && (
          <SubmitPanel
            caseId={vaultCase.id}
            submissions={monitor.submissions}
            now={now}
            open={canSubmit(timing, now) && state !== 'closed'}
            onSubmitted={onSubmitted}
          />
        )}

        {!sealed && <Monitor {...monitor} now={now} />}

        {state === 'closed' && (
          <p className="rounded-sm border border-muted/20 bg-cream px-3 py-2 text-body text-muted">
            {t('vault.archived')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The seal itself.
 *
 * DESIGN_BRIEF §3: "the one place to spend visual boldness". Dark maroon, gold,
 * and the claw mark the rest of the app uses sparingly. The 600ms break
 * animation belongs to the transition out of this state and is deferred with the
 * rest of the motion work — a seal that breaks on every re-render would be worse
 * than no animation, and `--duration-seal` is already reserved for it.
 */
function SealedPanel({ releaseAt }: { releaseAt: string }) {
  const t = useT();
  const { locale } = useLocale();

  return (
    <section
      data-surface="dark"
      className="rounded-lg border border-gold/30 bg-primary px-5 py-6 text-center"
    >
      <p className="text-meta font-bold uppercase tracking-widest text-sand">
        {t('vault.sealed')}
      </p>
      <p className="mt-2 font-unbounded text-lead font-bold text-gold">
        {t('vault.opensOn', { when: formatCaseTime(releaseAt, locale) })}
      </p>
      <p className="mt-3 text-body leading-relaxed text-cream">{t('vault.sealedExplain')}</p>
    </section>
  );
}
