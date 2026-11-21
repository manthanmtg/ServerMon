import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { createLogger } from '@/lib/logger';
import { cachedResult, cacheTimestamp, CACHE_TTL_MS, setCacheResult } from './cache';
import { getSession } from '@/lib/session';

const log = createLogger('api:disk:health');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedResult);
    }

    const [diskLayout, blockDevices] = await Promise.all([si.diskLayout(), si.blockDevices()]);

    setCacheResult({ layout: diskLayout, devices: blockDevices });

    return NextResponse.json({ layout: diskLayout, devices: blockDevices });
  } catch (error) {
    log.error('Failed to fetch disk health/layout', error);
    return NextResponse.json({ error: 'Failed to fetch disk health' }, { status: 500 });
  }
}
