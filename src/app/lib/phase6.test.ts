// ABOUTME: Unit tests for PWA detection — standalone, iOS Safari, and when push may be asked for.
// ABOUTME: These decide behaviour on devices nobody testing this is holding, which is why they are pure.
import { describe, expect, it } from 'vitest';
import { canAskForPush, isIosSafari, isStandalone, shouldOfferIosInstall } from './pwa';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36';
const DESKTOP_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

describe('isStandalone', () => {
  it('trusts the display-mode media query', () => {
    expect(isStandalone(true)).toBe(true);
    expect(isStandalone(false)).toBe(false);
  });

  it('falls back to navigator.standalone, which is all iOS ever offered', () => {
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(false, undefined)).toBe(false);
  });
});

describe('isIosSafari', () => {
  it('recognises Safari on an iPhone', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
  });

  it('rejects other browsers on iOS, which cannot install at all', () => {
    // They are Safari underneath, so a naive check says yes — and then the user
    // is given instructions for a button their browser does not have.
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(IPHONE_FIREFOX)).toBe(false);
  });

  it('rejects Android and desktop', () => {
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
    expect(isIosSafari(DESKTOP_SAFARI)).toBe(false);
  });
});

describe('shouldOfferIosInstall', () => {
  it('offers on iOS Safari in a browser tab', () => {
    expect(
      shouldOfferIosInstall({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: false }),
    ).toBe(true);
  });

  it('never offers to an app that is already installed', () => {
    expect(
      shouldOfferIosInstall({ userAgent: IPHONE_SAFARI, standalone: true, dismissed: false }),
    ).toBe(false);
  });

  it('respects a dismissal', () => {
    // A prompt that returns every visit is how people learn to ignore every
    // banner the app shows, including the ones that matter.
    expect(
      shouldOfferIosInstall({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: true }),
    ).toBe(false);
  });

  it('does not offer the iOS sheet on Android', () => {
    expect(
      shouldOfferIosInstall({ userAgent: ANDROID_CHROME, standalone: false, dismissed: false }),
    ).toBe(false);
  });
});

describe('canAskForPush', () => {
  it('refuses when the browser has no push at all', () => {
    expect(canAskForPush({ supportsPush: false, isIos: false, standalone: true })).toBe(false);
  });

  it('requires home-screen installation on iOS', () => {
    // iOS 16.4+ can do web push, but only from an installed app. Asking in a
    // Safari tab throws rather than prompting, so this gate is the difference
    // between an opt-in and a console error.
    expect(canAskForPush({ supportsPush: true, isIos: true, standalone: false })).toBe(false);
    expect(canAskForPush({ supportsPush: true, isIos: true, standalone: true })).toBe(true);
  });

  it('does not require installation elsewhere', () => {
    expect(canAskForPush({ supportsPush: true, isIos: false, standalone: false })).toBe(true);
  });
});
