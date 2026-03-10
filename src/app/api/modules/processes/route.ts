import { NextResponse } from 'next/server';
import si from 'systeminformation';

export async function GET() {
    try {
        const procs = await si.processes();
        const topProcs = procs.list
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 5)
            .map(p => ({
                pid: p.pid,
                name: p.name,
                cpu: p.cpu,
                mem: p.mem
            }));

        return NextResponse.json({ processes: topProcs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
