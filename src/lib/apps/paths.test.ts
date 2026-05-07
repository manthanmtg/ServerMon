/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppRoot, getAppsRoot } from './paths';

describe('apps path helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults managed apps to persistent server state outside release symlinks', () => {
    vi.stubEnv('SERVERMON_APPS_ROOT', '');

    expect(getAppsRoot()).toBe('/var/lib/servermon/apps');
    expect(getAppRoot('LifeOS')).toBe('/var/lib/servermon/apps/lifeos');
  });

  it('allows operators to override the managed apps root', () => {
    vi.stubEnv('SERVERMON_APPS_ROOT', '/srv/servermon-apps');

    expect(getAppsRoot()).toBe('/srv/servermon-apps');
    expect(getAppRoot('LifeOS')).toBe('/srv/servermon-apps/lifeos');
  });
});
