// ABOUTME: EN / FR toggle. The prototype has no language control at all — this is new.
// ABOUTME: Fixed-width segments so switching language never reflows the bar around it.
import { useLocale } from '../../i18n';
import type { Locale } from '../../i18n';

const OPTIONS: Locale[] = ['en', 'fr'];

/* The toggle appears on the maroon top bar and on the cream sign-in page, and
   the palette rule means those cannot share one set of colours: cream-on-cream
   is invisible, and the brand rule forbids gold or sand on a light surface.
   A tone prop is the honest way to say that, rather than overriding from the
   outside and hoping the specificity lands. */
type Tone = 'dark' | 'light';

const TONES: Record<Tone, { frame: string; on: string; off: string }> = {
  dark: {
    frame: 'border-cream/30',
    on: 'bg-cream text-primary',
    off: 'text-cream/70',
  },
  light: {
    frame: 'border-muted/40',
    on: 'bg-primary text-cream',
    off: 'text-muted',
  },
};

export default function LanguageToggle({ tone = 'dark' }: { tone?: Tone }) {
  const { locale, setLocale, t } = useLocale();
  const styles = TONES[tone];

  return (
    <div
      role="group"
      aria-label={t('shell.language')}
      className={`flex h-8 items-center rounded-sm border p-0.5 ${styles.frame}`}
    >
      {OPTIONS.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={active}
            /* min-w keeps both segments the same width in both languages, so the
               control does not shift under the finger that just tapped it. */
            className={[
              'grid h-7 min-w-8 place-items-center rounded-xs px-1.5 text-meta font-semibold uppercase',
              active ? styles.on : styles.off,
            ].join(' ')}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
