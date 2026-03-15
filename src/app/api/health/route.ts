import { NextResponse } from 'next/server';
import { metricsService } from '@/lib/metrics';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export async function GET() {
  const uptimeMs = Date.now() - startedAt;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  let dbStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  try {
    const state = mongoose.connection.readyState;
    dbStatus = state === 1 ? 'connected' : 'disconnected';
  } catch {
    dbStatus = 'error';
  }

  const latest = metricsService.getCurrent();
  const sseConnections = metricsService.getConnectionCount();

  const healthy = dbStatus !== 'error' && latest !== null;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      uptime: uptimeSec,
      database: dbStatus,
      metrics: latest ? { cpu: latest.cpu, memory: latest.memory } : null,
      sseConnections,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
