// ABOUTME: "A new version is ready" — offered, never applied underneath the user.
// ABOUTME: registerType 'prompt' (HANDOFF §8): nobody gets reloaded mid-submission because a deploy landed.
import { useT } from '../../i18n';
import { useServiceWorker } from '../../lib/pwa';

export default function UpdatePrompt() {
  const t = useT();
  const { updateReady, applyUpdate } = useServiceWorker();

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/40 bg-gold/15 px-4 py-2"
    >
      <p className="text-body text-ink-800">{t('pwa.updateReady')}</p>
      <button
        type="button"
        onClick={applyUpdate}
        className="min-h-11 rounded-sm bg-primary px-3 text-body font-semibold text-cream"
      >
        {t('pwa.updateNow')}
      </button>
    </div>
  );
}
