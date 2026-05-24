import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CACHE_TTL_MS, cachedResult, cacheTimestamp, setCacheResult, _resetCacheForTest } from './cache';

describe('disk health cache', () => {
  beforeEach(() => {
    _resetCacheForTest();
    vi.useRealTimers();
  });

  it('should expose the expected cache TTL', () => {
    expect(CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('should start with empty cache state after reset', () => {
    expect(cachedResult).toBeNull();
    expect(cacheTimestamp).toBe(0);
  });

  it('should cache latest result and set timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T05:03:00.000Z'));

    const result = {
      layout: { type: 'gpt' },
      devices: [{ name: 'disk0' }],
    };

    setCacheResult(result);

    expect(cachedResult).toEqual(result);
    expect(cacheTimestamp).toBe(Date.now());

    vi.useRealTimers();
  });

  it('should overwrite existing cache entries with new values', () => {
    const firstResult = {
      layout: { type: 'first' },
      devices: [{ name: 'first-disk' }],
    };
    const nextResult = {
      layout: { type: 'next' },
      devices: [{ name: 'next-disk' }],
    };

    setCacheResult(firstResult);
    const firstTimestamp = cacheTimestamp;

    setCacheResult(nextResult);

    expect(cachedResult).toEqual(nextResult);
    expect(cacheTimestamp).toBeGreaterThanOrEqual(firstTimestamp);
  });

  it('should expose direct references to cached payload', () => {
    const result = {
      layout: { nested: { enabled: true } },
      devices: ['device-a', 'device-b'],
    };

    setCacheResult(result);

    expect(cachedResult).toBe(result);
  });

  it('should reset cache state to defaults', () => {
    setCacheResult({ layout: { value: 1 }, devices: [] });
    _resetCacheForTest();

    expect(cachedResult).toBeNull();
    expect(cacheTimestamp).toBe(0);
  });
});
