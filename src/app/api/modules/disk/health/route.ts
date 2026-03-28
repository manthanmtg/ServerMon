import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:disk:health');

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedResult: { layout: unknown; devices: unknown } | null = null;
let cacheTimestamp = 0;

export function _resetCacheForTest() {
  cachedResult = null;
  cacheTimestamp = 0;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedResult);
    }

    const [diskLayout, blockDevices] = await Promise.all([si.diskLayout(), si.blockDevices()]);

    cachedResult = { layout: diskLayout, devices: blockDevices };
    cacheTimestamp = now;

    return NextResponse.json(cachedResult);
  } catch (error) {
    log.error('Failed to fetch disk health/layout', error);
    return NextResponse.json({ error: 'Failed to fetch disk health' }, { status: 500 });
  }
}
