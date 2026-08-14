// ABOUTME: Quiet persistent offline bar — states what still works rather than blocking the app.
// ABOUTME: Uses a live region so the state change reaches a screen reader without stealing focus.
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';

export default function OfflineBar() {
  const t = useT();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Read after mount, not during render: navigator does not exist on the server
    // and the first client render must match what the server produced.
    setOnline(navigator.onLine);

    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return (
    /* The region is always mounted so assistive tech announces the transition.
       DESIGN_BRIEF §7: a bar, never a modal — it says what still works. */
    <div role="status" aria-live="polite" className="flex-none">
      {!online && (
        <div
          data-surface="dark"
          className="flex items-start gap-2.5 border-b border-gold/30 bg-ink-800 px-4 py-2.5 text-cream"
        >
          <span
            aria-hidden="true"
            className="mt-1 size-2 flex-none rounded-full bg-gold motion-safe:animate-pulse"
          />
          <span className="text-meta leading-relaxed">{t('shell.offline')}</span>
        </div>
      )}
    </div>
  );
}
