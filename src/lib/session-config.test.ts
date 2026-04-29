import { describe, expect, it } from 'vitest';

import { SESSION_REFRESH_THROTTLE_MS, SESSION_TIMEOUT_MS } from './session-config';

describe('session-config', () => {
  it('uses a two hour session timeout', () => {
    expect(SESSION_TIMEOUT_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('uses a one minute refresh throttle', () => {
    expect(SESSION_REFRESH_THROTTLE_MS).toBe(60 * 1000);
  });

  it('keeps the refresh throttle shorter than the timeout', () => {
    expect(SESSION_REFRESH_THROTTLE_MS).toBeLessThan(SESSION_TIMEOUT_MS);
  });

  it('allows many refresh windows within one session', () => {
    expect(SESSION_TIMEOUT_MS / SESSION_REFRESH_THROTTLE_MS).toBe(120);
  });

  it('exports millisecond values as positive safe integers', () => {
    expect(Number.isSafeInteger(SESSION_TIMEOUT_MS)).toBe(true);
    expect(Number.isSafeInteger(SESSION_REFRESH_THROTTLE_MS)).toBe(true);
    expect(SESSION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SESSION_REFRESH_THROTTLE_MS).toBeGreaterThan(0);
  });
});
