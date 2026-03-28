export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export let cachedResult: { layout: unknown; devices: unknown } | null = null;
export let cacheTimestamp = 0;

export function setCacheResult(result: { layout: unknown; devices: unknown }) {
  cachedResult = result;
  cacheTimestamp = Date.now();
}

export function _resetCacheForTest() {
  cachedResult = null;
  cacheTimestamp = 0;
}
