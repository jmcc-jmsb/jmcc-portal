// ABOUTME: Push opt-in, offered per alert type rather than as a blanket permission ask.
// ABOUTME: iOS needs 16.4+ AND home-screen install before it may even be asked (HANDOFF §8).
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { canAskForPush, isIosSafari, useInstallState } from '../../lib/pwa';

/**
 * base64url → bytes, which is the only form `applicationServerKey` accepts.
 *
 * Backed by an explicit ArrayBuffer rather than `Uint8Array.from`: the latter
 * infers `ArrayBufferLike`, which could be a SharedArrayBuffer, and the DOM
 * signature wants a plain one.
 */
function decodeKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export default function PushOptIn() {
  const t = useT();
  const { standalone } = useInstallState();

  const [eligible, setEligible] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'on' | 'blocked' | 'failed'>('idle');

  useEffect(() => {
    const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window;
    const ios = isIosSafari(navigator.userAgent);
    setEligible(canAskForPush({ supportsPush, isIos: ios, standalone }));

    if (supportsPush && Notification.permission === 'granted') setState('on');
    if (supportsPush && Notification.permission === 'denied') setState('blocked');
  }, [standalone]);

  if (!eligible || state === 'on') return null;

  async function enable() {
    setState('busy');
    try {
      /* Permission is requested here, on a click, and only after the delegate
         has chosen a thing to be told about. §8: "Request permission only after
         the user opts into a specific alert type." A permission prompt on load
         is denied by reflex, and a denial is close to permanent. */
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'idle');
        return;
      }

      const keyResponse = await fetch('/api/push/key');
      if (!keyResponse.ok) {
        setState('failed');
        return;
      }
      const { key } = (await keyResponse.json()) as { key: string };

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Non-silent is mandatory in Chrome: a silent push subscription is
        // rejected outright rather than degraded.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(key),
      });

      const saved = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      setState(saved.ok ? 'on' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="mx-4 my-3 rounded-md border border-muted/25 bg-white p-3">
      <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
        {t('pwa.pushTitle')}
      </h2>
      <p className="mt-1 text-body leading-relaxed text-muted">{t('pwa.pushWhy')}</p>

      {state === 'blocked' ? (
        // Nothing this app can do once the browser has been told no; saying so
        // beats a button that silently does nothing.
        <p className="mt-2 text-body text-muted">{t('pwa.pushBlocked')}</p>
      ) : (
        <button
          type="button"
          disabled={state === 'busy'}
          onClick={enable}
          className="mt-2 min-h-11 rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-50"
        >
          {state === 'busy' ? t('pwa.pushEnabling') : t('pwa.pushEnable')}
        </button>
      )}

      {state === 'failed' && (
        <p role="alert" className="mt-2 text-body text-danger">
          {t('pwa.pushFailed')}
        </p>
      )}
    </div>
  );
}
