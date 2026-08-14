// ABOUTME: Placeholder screen for routes whose real content lands in a later phase.
// ABOUTME: Deliberately empty of invented data — a fake dashboard makes a review useless.
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n';

export default function Screen({
  titleKey,
  phaseKey,
}: {
  titleKey: TranslationKey;
  phaseKey: TranslationKey;
}) {
  const t = useT();

  return (
    <div className="px-4 py-5">
      <h1 className="font-unbounded text-title font-bold text-primary">{t(titleKey)}</h1>
      <p className="mt-3 text-body text-muted">{t('screen.placeholder')}</p>
      <p className="mt-1 text-body text-muted">{t(phaseKey)}</p>
    </div>
  );
}
