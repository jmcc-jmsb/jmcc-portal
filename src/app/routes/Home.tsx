// ABOUTME: Home — the greeting and the delegate priority stack's section headers.
// ABOUTME: Sections are empty on purpose in Phase 1; each one fills in the phase named beside it.
import { Fragment } from 'react';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n';
import { useSession } from '../lib/session';
import PromoCard from '../components/promo/PromoCard';

/* DESIGN_BRIEF §5.1 orders the delegate stack: what is coming, what is owed,
   what is today, what is new. Phase 1 stands up the frame and the language, not
   the data — the countdown needs serverTime (Phase 2) and the rest needs tables
   that do not exist yet. Rendering plausible-looking placeholder rows here would
   make the exec review worse, not better. */
const SECTIONS: { key: TranslationKey; phase: TranslationKey }[] = [
  { key: 'home.next', phase: 'screen.phase2' },
  { key: 'home.needs', phase: 'screen.phase4' },
  { key: 'home.today', phase: 'screen.phase3' },
  { key: 'home.recent', phase: 'screen.phase5' },
];

export default function Home() {
  const t = useT();
  const { profile, effectiveRole } = useSession();

  const name = profile?.preferred_name ?? profile?.full_name?.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <header>
        <h1 className="font-unbounded text-title font-bold text-primary">
          {name ? `${t('home.greeting')}, ${name}` : t('home.greeting')}
        </h1>
        <p className="mt-1 text-body text-muted">
          {t('app.season')} · {t(`role.${effectiveRole}` as const)}
        </p>
      </header>

      {SECTIONS.map((section, index) => (
        <Fragment key={section.key}>
          {/* Mid-stack, exactly one slot (DESIGN_BRIEF §5.9): after what is
              coming and what is owed, before today and recent. A promo above the
              next-up countdown would be advertising over a deadline. */}
          {index === 2 && <PromoCard />}
        <section className="rounded-md border border-muted/20 bg-white p-4">
          {/* The eyebrow is where the French length test bites hardest:
              "NEEDS YOU" is 9 characters and "ACTION REQUISE" is 14. */}
          <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
            {t(section.key)}
          </h2>
          <p className="mt-2 text-body text-muted">{t(section.phase)}</p>
        </section>
        </Fragment>
      ))}
    </div>
  );
}
