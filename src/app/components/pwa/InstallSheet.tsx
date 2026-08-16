// ABOUTME: The install prompt — the illustrated iOS Share sheet, or the native prompt elsewhere.
// ABOUTME: Never on first load: it appears once the delegate has actually finished something.
import { useT } from '../../i18n';
import { useInstallState } from '../../lib/pwa';

export default function InstallSheet({ earned }: { earned: boolean }) {
  const t = useT();
  const { standalone, offerIos, promptInstall, dismiss } = useInstallState();

  /* §8: "Trigger beforeinstallprompt on Android/desktop only after a meaningful
     completion, never on first load." `earned` is that gate — the shell passes
     it once the delegate has done something real. An install prompt on arrival
     is the fastest way to teach someone to dismiss everything this app shows. */
  if (standalone || !earned) return null;
  if (!offerIos && !promptInstall) return null;

  return (
    <div className="mx-4 my-3 rounded-md border border-gold/40 bg-gold/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
            {t('pwa.installTitle')}
          </h2>
          <p className="mt-1 text-body leading-relaxed text-ink">{t('pwa.installWhy')}</p>

          {offerIos ? (
            /* iOS has no programmatic install, so the only honest thing is to
               describe the gesture. Spelled out rather than drawn: an icon of
               the Share glyph is a different shape on every iOS version. */
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4 text-body text-ink">
              <li>{t('pwa.iosStep1')}</li>
              <li>{t('pwa.iosStep2')}</li>
              <li>{t('pwa.iosStep3')}</li>
            </ol>
          ) : (
            <button
              type="button"
              onClick={() => void promptInstall?.()}
              className="mt-2 min-h-11 rounded-sm bg-primary px-4 text-body font-semibold text-cream"
            >
              {t('pwa.install')}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t('pwa.dismiss')}
          className="min-h-11 flex-none px-2 text-body font-bold text-muted"
        >
          ×
        </button>
      </div>
    </div>
  );
}
