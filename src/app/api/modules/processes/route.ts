import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger('api:processes');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limitParam = Math.min(Number(searchParams.get('limit') || '50'), 200);
    const sortBy = searchParams.get('sort') || 'cpu';
    const search = searchParams.get('search') || '';

    try {
        const [procs, cpuInfo, memInfo] = await Promise.all([
            si.processes(),
            si.currentLoad(),
            si.mem(),
        ]);

        let list = procs.list.map(p => ({
            pid: p.pid,
            parentPid: p.parentPid,
            name: p.name,
            command: p.command || p.name,
            path: p.path || '',
            user: p.user || 'system',
            state: p.state || 'unknown',
            cpu: p.cpu,
            mem: p.mem,
            memRss: p.memRss,
            started: p.started || '',
            priority: p.priority,
        }));

        if (search) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.command.toLowerCase().includes(q) ||
                String(p.pid).includes(q) ||
                p.user.toLowerCase().includes(q)
            );
        }

        const sortKey = sortBy as keyof typeof list[0];
        list.sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (typeof aVal === 'number' && typeof bVal === 'number') return bVal - aVal;
            return String(bVal).localeCompare(String(aVal));
        });

        list = list.slice(0, limitParam);

        const summary = {
            total: procs.all,
            running: procs.running,
            sleeping: procs.sleeping,
            blocked: procs.blocked,
            cpuLoad: cpuInfo.currentLoad,
            memTotal: memInfo.total,
            memUsed: memInfo.active,
            memPercent: (memInfo.active / memInfo.total) * 100,
        };

        return NextResponse.json({ processes: list, summary });
    } catch (error: unknown) {
        log.error('Failed to fetch processes', error);
        return NextResponse.json(
            { error: 'Failed to retrieve process list' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const { pid, signal } = await request.json();
        if (!pid || typeof pid !== 'number') {
            return NextResponse.json({ error: 'Valid PID required' }, { status: 400 });
        }

        const sig = signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM';
        process.kill(pid, sig);

        log.info(`Sent ${sig} to PID ${pid}`);
        return NextResponse.json({ success: true, pid, signal: sig });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to send signal';
        log.error(`Failed to kill process`, error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
