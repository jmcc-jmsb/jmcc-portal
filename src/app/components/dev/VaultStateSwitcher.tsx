// ABOUTME: Dev-only control to jump the vault between its five states without waiting for Saturday.
// ABOUTME: Gated on PUBLIC_ENABLE_DEV_CONTROLS, same as the role switcher; renders nothing in production.
import { PUBLIC_ENABLE_DEV_CONTROLS } from 'astro:env/client';
import { useT } from '../../i18n';
import { VAULT_STATES } from '../../lib/caseState';
import type { VaultState } from '../../lib/caseState';

/** null means "whatever the real data says", which is the default and the honest one. */
export type ForcedState = VaultState | null;

export default function VaultStateSwitcher({
  value,
  onChange,
}: {
  value: ForcedState;
  onChange: (next: ForcedState) => void;
}) {
  const t = useT();

  if (!PUBLIC_ENABLE_DEV_CONTROLS) return null;

  /* DESIGN_BRIEF §5.7: "Reviewers will not wait until Saturday at 8:00 AM to see
     state 2." Buttons rather than a cycle, unlike the role switcher — a reviewer
     comparing state 3 against state 4 should not have to walk through the other
     three to get back. */
  const options: ForcedState[] = [null, ...VAULT_STATES];

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-sm border border-dashed border-primary/40 bg-cream px-2.5 py-2"
      role="group"
      aria-label={t('dev.vaultState')}
    >
      <span className="text-meta font-bold tracking-widest text-primary">{t('dev.label')}</span>
      {options.map((option) => (
        <button
          key={option ?? 'live'}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={[
            'min-h-8 rounded-xs px-2 text-meta font-semibold',
            value === option ? 'bg-primary text-cream' : 'bg-white text-muted',
          ].join(' ')}
        >
          {option ? t(`vault.state.${option}` as const) : t('dev.live')}
        </button>
      ))}
    </div>
  );
}
