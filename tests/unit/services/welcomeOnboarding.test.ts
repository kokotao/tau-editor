import { describe, expect, it } from 'vitest';
import { shouldShowWelcomePackageOnLaunch } from '@/services/welcomeOnboarding';

const now = Date.UTC(2026, 10, 16);
const reopenIntervalMs = 14 * 24 * 60 * 60 * 1000;

describe('shouldShowWelcomePackageOnLaunch', () => {
  it('shows the guide and sample on first install', () => {
    expect(shouldShowWelcomePackageOnLaunch({
      previousVersion: null,
      currentVersion: '0.6.45',
      lastOpenedAt: null,
      now,
      reopenIntervalMs,
    })).toBe(true);
  });

  it('shows the guide and sample after an application update', () => {
    expect(shouldShowWelcomePackageOnLaunch({
      previousVersion: '0.6.44',
      currentVersion: '0.6.45',
      lastOpenedAt: now - 1000,
      now,
      reopenIntervalMs,
    })).toBe(true);
  });

  it('reopens the guide periodically but does not repeat it on every launch', () => {
    const launch = (lastOpenedAt: number) => shouldShowWelcomePackageOnLaunch({
      previousVersion: '0.6.45',
      currentVersion: '0.6.45',
      lastOpenedAt,
      now,
      reopenIntervalMs,
    });

    expect(launch(now - reopenIntervalMs + 1000)).toBe(false);
    expect(launch(now - reopenIntervalMs)).toBe(true);
  });
});
