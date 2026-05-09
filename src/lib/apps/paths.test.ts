/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppRepositoryRoot, getAppRoot, getAppsRoot, getReleaseRoot } from './paths';

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

  it('keeps git repository checkouts outside release directories', () => {
    vi.stubEnv('SERVERMON_APPS_ROOT', '/srv/servermon-apps');

    expect(getAppRepositoryRoot('LifeOS')).toBe('/srv/servermon-apps/lifeos/repository');
  });

  it('keeps releases under the sanitized app-specific release directory', () => {
    vi.stubEnv('SERVERMON_APPS_ROOT', '/srv/servermon-apps');

    expect(getReleaseRoot('LifeOS', '2026-05-09T2345')).toBe(
      '/srv/servermon-apps/lifeos/releases/2026-05-09T2345'
    );
  });

  it('supports an explicit apps root for release paths', () => {
    expect(getReleaseRoot('Admin Panel', 'release-7', '/mnt/apps')).toBe(
      '/mnt/apps/admin-panel/releases/release-7'
    );
  });

  it('sanitizes app slugs consistently across roots', () => {
    expect(getAppRoot('My_Custom App!', '/srv/apps')).toBe('/srv/apps/my-custom-app');
    expect(getAppRepositoryRoot('My_Custom App!', '/srv/apps')).toBe(
      '/srv/apps/my-custom-app/repository'
    );
    expect(getReleaseRoot('My_Custom App!', 'r1', '/srv/apps')).toBe(
      '/srv/apps/my-custom-app/releases/r1'
    );
  });
});
