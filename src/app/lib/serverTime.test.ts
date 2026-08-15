// ABOUTME: Unit tests for clock sync — the offset, and the drift the UI has to surface.
// ABOUTME: Uses fake timers so "the device is four minutes fast" is a fact rather than a wait.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIFT_THRESHOLD_MS, applyServerNow, consumeDrift, isSynced, now } from './serverTime';

const DEVICE_NOW = Date.parse('2027-01-16T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(DEVICE_NOW);
  // The module keeps one offset for the tab, which is the right shape for the
  // app and an awkward one for tests: reset it by syncing to the device clock.
  applyServerNow(new Date(DEVICE_NOW).toISOString());
  consumeDrift();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('applyServerNow', () => {
  it('reports server time, not device time, once synced', () => {
    applyServerNow('2027-01-16T12:05:00.000Z');
    expect(now()).toBe(DEVICE_NOW + 5 * 60 * 1000);
    expect(isSynced()).toBe(true);
  });

  it('keeps ticking with the device between syncs', () => {
    applyServerNow('2027-01-16T12:05:00.000Z');
    vi.setSystemTime(DEVICE_NOW + 30_000);
    expect(now()).toBe(DEVICE_NOW + 5 * 60 * 1000 + 30_000);
  });

  it('ignores a response whose timestamp does not parse', () => {
    applyServerNow('2027-01-16T12:05:00.000Z');
    const before = now();
    applyServerNow('not a date');
    expect(now()).toBe(before);
  });
});

describe('drift', () => {
  it('does not report the first sync as drift, however wrong the device was', () => {
    // A phone an hour behind has not drifted; it was simply set wrong. Warning
    // about that on first load would be noise on every stale device.
    expect(consumeDrift()).toBe(0);
  });

  it('reports a later jump past the threshold', () => {
    applyServerNow(new Date(DEVICE_NOW + DRIFT_THRESHOLD_MS + 1000).toISOString());
    expect(consumeDrift()).toBeGreaterThan(DRIFT_THRESHOLD_MS);
  });

  it('stays quiet for an ordinary correction', () => {
    applyServerNow(new Date(DEVICE_NOW + 2000).toISOString());
    expect(consumeDrift()).toBe(0);
  });

  it('reports a backwards jump too — a countdown gaining time is the worse case', () => {
    applyServerNow(new Date(DEVICE_NOW - DRIFT_THRESHOLD_MS - 1000).toISOString());
    expect(consumeDrift()).toBeLessThan(-DRIFT_THRESHOLD_MS);
  });

  it('clears once read, so the banner does not reappear on every tick', () => {
    applyServerNow(new Date(DEVICE_NOW + DRIFT_THRESHOLD_MS + 1000).toISOString());
    expect(consumeDrift()).not.toBe(0);
    expect(consumeDrift()).toBe(0);
  });
});
