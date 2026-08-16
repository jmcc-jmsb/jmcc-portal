// ABOUTME: Service worker registration, the update prompt, and install-eligibility rules.
// ABOUTME: The detection functions are pure and take their inputs, so the iOS rules can be tested without an iPhone.
import { useEffect, useState } from 'react';

/* ── Detection ─────────────────────────────────────────────────────────────
   Pure, and given their inputs rather than reading globals, because the whole
   point is behaviour on devices nobody testing this is holding. */

/** Already installed: launched from the home screen rather than a browser tab. */
export function isStandalone(matchesDisplayMode: boolean, navigatorStandalone?: boolean): boolean {
  // iOS never implemented display-mode for the Safari-specific install, so the
  // legacy navigator.standalone is still the only signal there.
  return matchesDisplayMode || navigatorStandalone === true;
}

/**
 * iOS Safari specifically, not any browser on iOS.
 *
 * Chrome and Firefox on iOS are Safari underneath but cannot install to the home
 * screen at all, so showing them the Share → Add to Home Screen sheet would be
 * instructions for a button they do not have.
 */
export function isIosSafari(userAgent: string): boolean {
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || /Macintosh/.test(userAgent) === false && /iOS/.test(userAgent);
  if (!isIos) return false;
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPT/OPiOS = Opera.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(userAgent);
}

/**
 * Whether to offer the iOS install sheet.
 *
 * HANDOFF §8: "Wire it to real detection: iOS Safari, not already standalone."
 * Dismissal is remembered, because an install prompt that returns every visit is
 * how people learn to ignore the whole app's chrome.
 */
export function shouldOfferIosInstall(input: {
  userAgent: string;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  return isIosSafari(input.userAgent) && !input.standalone && !input.dismissed;
}

/**
 * Push is possible at all.
 *
 * iOS needs 16.4+ **and** home-screen installation before a web app may even ask
 * (§8). Asking in a Safari tab on iOS throws rather than showing a prompt, so
 * this gate is the difference between an opt-in and a console error.
 */
export function canAskForPush(input: {
  supportsPush: boolean;
  isIos: boolean;
  standalone: boolean;
}): boolean {
  if (!input.supportsPush) return false;
  return input.isIos ? input.standalone : true;
}

/* ── Registration ──────────────────────────────────────────────────────────── */

const DISMISS_KEY = 'jmcc.install.dismissed';

export type UpdateState = {
  /** A new service worker is installed and waiting for permission to take over. */
  updateReady: boolean;
  applyUpdate: () => void;
};

/**
 * Register the worker and surface updates rather than applying them.
 *
 * `registerType: 'prompt'` in §8 means exactly this: a delegate mid-submission
 * must not have the page reload under them because a deploy landed. The new
 * worker waits until they say so.
 */
export function useServiceWorker(): UpdateState {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) setWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // A worker that reaches `installed` while one is already in control is
          // an update; the first ever install has no controller and is not.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(installing);
          }
        });
      });
    };

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(watch).catch(() => undefined);

    // The controller changing means our skipWaiting took effect.
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return {
    updateReady: waiting !== null,
    applyUpdate: () => waiting?.postMessage('SKIP_WAITING'),
  };
}

/** Live standalone / install state for the current device. */
export function useInstallState(): {
  standalone: boolean;
  offerIos: boolean;
  promptInstall: (() => Promise<void>) | null;
  dismiss: () => void;
} {
  const [standalone, setStandalone] = useState(false);
  const [offerIos, setOfferIos] = useState(false);
  const [deferred, setDeferred] = useState<Event | null>(null);

  useEffect(() => {
    const matches = window.matchMedia('(display-mode: standalone)').matches;
    const installed = isStandalone(matches, (navigator as { standalone?: boolean }).standalone);
    setStandalone(installed);

    setOfferIos(
      shouldOfferIosInstall({
        userAgent: navigator.userAgent,
        standalone: installed,
        dismissed: window.localStorage.getItem(DISMISS_KEY) === '1',
      }),
    );

    /* Captured, not shown. §8: trigger it "only after a meaningful completion,
       never on first load" — so the event is held and the UI decides when. */
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  return {
    standalone,
    offerIos,
    promptInstall: deferred
      ? async () => {
          await (deferred as Event & { prompt: () => Promise<void> }).prompt();
          setDeferred(null);
        }
      : null,
    dismiss: () => {
      window.localStorage.setItem(DISMISS_KEY, '1');
      setOfferIos(false);
    },
  };
}
