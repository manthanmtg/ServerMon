/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

const { mockInstallerScript } = vi.hoisted(() => ({
  mockInstallerScript:
    '#!/usr/bin/env bash\nset -euo pipefail\necho "installing servermon agent"\n',
}));

vi.mock('@/lib/fleet/install-script', () => ({
  AGENT_INSTALLER_BASH: mockInstallerScript,
}));

import { dynamic, GET } from './route';

describe('GET /api/fleet/install/script', () => {
  it('keeps the route dynamic so the latest installer is served', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('returns the fleet agent installer script body', async () => {
    const response = await GET();

    await expect(response.text()).resolves.toBe(mockInstallerScript);
  });

  it('returns a successful response', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });

  it('serves the installer as a shell script', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('text/x-shellscript');
  });

  it('prevents caching so agents receive the current installer', async () => {
    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
  });
});
