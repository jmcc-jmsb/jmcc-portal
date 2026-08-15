// ABOUTME: Dev-only control to view the cabinet at all three fill states without earning anything.
// ABOUTME: The prototype's "Cabinet fill" panel (export line 968), behind the same flag as the other switchers.
import { PUBLIC_ENABLE_DEV_CONTROLS } from 'astro:env/client';
import { useT } from '../../i18n';
import type { FillState } from '../../lib/cabinet';

/** null means "whatever this delegate has actually earned". */
export type ForcedFill = FillState | null;

const OPTIONS: ForcedFill[] = [null, 'empty', 'partial', 'full'];

export default function CabinetFillSwitcher({
  value,
  onChange,
}: {
  value: ForcedFill;
  onChange: (next: ForcedFill) => void;
}) {
  const t = useT();

  if (!PUBLIC_ENABLE_DEV_CONTROLS) return null;

  /* The empty cabinet is the screen's highest-stakes state and the one nobody
     can reach on demand — a reviewer would have to find a first-year account, or
     delete somebody's awards. HANDOFF §9 asks for all three fill states in this
     phase; this is how they get looked at. */
  return (
    <div
      role="group"
      aria-label={t('dev.cabinetFill')}
      className="flex flex-wrap items-center gap-1.5 rounded-sm border border-dashed border-primary/40 bg-cream px-2.5 py-2"
    >
      <span className="text-meta font-bold tracking-widest text-primary">{t('dev.label')}</span>
      {OPTIONS.map((option) => (
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
          {option ? t(`cabinet.fill.${option}` as const) : t('dev.live')}
        </button>
      ))}
    </div>
  );
}
