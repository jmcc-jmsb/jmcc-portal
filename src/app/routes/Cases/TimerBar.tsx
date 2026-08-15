// ABOUTME: The persistent countdown bar — time left in the work window, warning treatment in the final hour.
// ABOUTME: Reads server time only; a device clock cannot move this bar.
import { useT } from '../../i18n';
import { countdownTarget, formatDuration, isFinalInterval } from '../../lib/caseState';
import type { CaseTiming } from '../../lib/caseState';

export default function TimerBar({ timing, now }: { timing: CaseTiming; now: number }) {
  const t = useT();

  const target = countdownTarget(timing, now);
  if (!target) return null;

  const remaining = Date.parse(target) - now;
  const warn = isFinalInterval(timing, now);
  const sealed = !timing.released;

  const units = { d: t('time.d'), h: t('time.h'), m: t('time.m'), s: t('time.s') };

  return (
    <div
      data-surface="dark"
      /* COMPONENT_MAP line 346: the final-hour bar is `danger` with a gold
         border. Sticky rather than fixed — AppShell scrolls <main>, so this
         pins to the top of the content and leaves the safe-area chrome alone. */
      className={[
        'sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b px-4 py-2.5',
        warn ? 'border-gold bg-danger' : 'border-gold/20 bg-primary',
      ].join(' ')}
    >
      <span className="text-meta font-bold uppercase tracking-widest text-sand">
        {sealed ? t('vault.opensIn') : t('vault.remaining')}
      </span>
      <span
        /* aria-live on a per-second countdown would narrate every tick. The
           deadline itself is announced in the panel below; this is the glance
           version, and screen readers get the sentence instead. */
        aria-hidden="true"
        className="font-unbounded text-lead font-bold tabular-nums text-gold"
      >
        {formatDuration(remaining, units)}
      </span>
    </div>
  );
}
