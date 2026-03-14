import { metricsService } from '@/lib/metrics';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const latest = metricsService.getCurrent();
    const connectionCount = metricsService.getConnectionCount();
    
    return NextResponse.json({
        hasLatest: !!latest,
        latest: latest ? {
            timestamp: latest.timestamp,
            cpu: latest.cpu,
            memory: latest.memory,
            memTotal: latest.memTotal,
            memUsed: latest.memUsed,
            cpuCores: latest.cpuCores,
        } : null,
        connectionCount,
        env: {
            LOG_LEVEL: process.env.LOG_LEVEL || 'not set',
            NODE_ENV: process.env.NODE_ENV,
        }
    });
}
