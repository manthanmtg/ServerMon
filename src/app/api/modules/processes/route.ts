import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:processes');

export async function GET() {
    try {
        const procs = await si.processes();
        const topProcs = procs.list
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 20)
            .map(p => ({
                pid: p.pid,
                name: p.name,
                cpu: p.cpu,
                mem: p.mem
            }));

        return NextResponse.json({ processes: topProcs });
    } catch (error: unknown) {
        log.error('Failed to fetch processes', error);
        return NextResponse.json(
            { error: 'Failed to retrieve process list' },
            { status: 500 }
        );
    }
}
