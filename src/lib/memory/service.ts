import si from 'systeminformation';
import { createLogger } from '@/lib/logger';

const log = createLogger('memory-service');

export interface MemoryStats {
    total: number;
    free: number;
    used: number;
    active: number;
    available: number;
    buffers: number;
    cached: number;
    slab: number;
    swaptotal: number;
    swapused: number;
    swapfree: number;
}

export interface MemoryProcess {
    pid: number;
    name: string;
    mem: number;
    memRss: number;
    memVsz: number;
}

class MemoryService {
    private static instance: MemoryService;

    private constructor() {}

    public static getInstance(): MemoryService {
        if (!MemoryService.instance) {
            MemoryService.instance = new MemoryService();
        }
        return MemoryService.instance;
    }

    public async getDetailedStats(): Promise<MemoryStats> {
        try {
            const mem = await si.mem();
            return {
                total: mem.total,
                free: mem.free,
                used: mem.used,
                active: mem.active,
                available: mem.available,
                buffers: mem.buffers,
                cached: mem.cached,
                slab: mem.slab,
                swaptotal: mem.swaptotal,
                swapused: mem.swapused,
                swapfree: mem.swapfree,
            };
        } catch (err: unknown) {
            log.error('Failed to fetch detailed memory stats', err);
            throw err;
        }
    }

    public async getTopMemoryProcesses(limit: number = 10): Promise<MemoryProcess[]> {
        try {
            const procs = await si.processes();
            return procs.list
                .sort((a, b) => b.mem - a.mem)
                .slice(0, limit)
                .map(p => ({
                    pid: p.pid,
                    name: p.name,
                    mem: p.mem,
                    memRss: p.memRss,
                    memVsz: p.memVsz,
                }));
        } catch (err: unknown) {
            log.error('Failed to fetch top memory processes', err);
            throw err;
        }
    }
}

export const memoryService = MemoryService.getInstance();
