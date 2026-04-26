import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import {
  NETWORK_SPEEDTEST_INTERVALS,
  getNetworkSpeedtestOverview,
  runNetworkSpeedtest,
  updateNetworkSpeedtestSchedule,
} from '@/lib/network/speedtest';

export const dynamic = 'force-dynamic';

const log = createLogger('api:network:speedtest');

const SchedulePatchZ = z.object({
  scheduleInterval: z.enum(NETWORK_SPEEDTEST_INTERVALS),
});

async function requireSession() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getNetworkSpeedtestOverview());
  } catch (error) {
    log.error('Failed to fetch speedtest overview', error);
    return NextResponse.json({ error: 'Failed to fetch speedtest overview' }, { status: 500 });
  }
}

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await runNetworkSpeedtest('manual'));
  } catch (error) {
    const message = errorMessage(error);
    if (message === 'Speedtest already running') {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    log.error('Failed to run speedtest', error);
    return NextResponse.json({ error: 'Failed to run speedtest' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = SchedulePatchZ.parse(await request.json());
    return NextResponse.json(await updateNetworkSpeedtestSchedule(body.scheduleInterval));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues
            .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
            .join(', '),
        },
        { status: 400 }
      );
    }
    log.error('Failed to update speedtest schedule', error);
    return NextResponse.json({ error: 'Failed to update speedtest schedule' }, { status: 500 });
  }
}
