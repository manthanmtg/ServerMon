/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import si from 'systeminformation';
import { memoryService } from './service';

// Mock systeminformation
vi.mock('systeminformation', () => ({
  default: {
    mem: vi.fn(),
    processes: vi.fn(),
  },
  __esModule: true,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDetailedStats', () => {
    it('should return formatted memory stats', async () => {
      const mockMem = {
        total: 16000,
        free: 4000,
        used: 12000,
        active: 8000,
        available: 6000,
        buffers: 100,
        cached: 1000,
        slab: 200,
        swaptotal: 2000,
        swapused: 500,
        swapfree: 1500,
      };
      (si.mem as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(mockMem);

      const stats = await memoryService.getDetailedStats();

      expect(stats).toEqual(mockMem);
      expect(si.mem).toHaveBeenCalledTimes(1);
    });

    it('should throw and log if systeminformation fails', async () => {
      const error = new Error('SI Error');
      (si.mem as unknown as { mockRejectedValue: (v: unknown) => void }).mockRejectedValue(error);

      await expect(memoryService.getDetailedStats()).rejects.toThrow('SI Error');
    });
  });

  describe('getTopMemoryProcesses', () => {
    it('should return top processes sorted by memory usage', async () => {
      const mockProcs = {
        list: [
          { pid: 1, name: 'proc1', mem: 10, memRss: 100, memVsz: 1000 },
          { pid: 2, name: 'proc2', mem: 30, memRss: 300, memVsz: 3000 },
          { pid: 3, name: 'proc3', mem: 20, memRss: 200, memVsz: 2000 },
        ],
      };
      (si.processes as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
        mockProcs
      );

      const topProcs = await memoryService.getTopMemoryProcesses(2);

      expect(topProcs).toHaveLength(2);
      expect(topProcs[0].pid).toBe(2); // Highest mem (30)
      expect(topProcs[1].pid).toBe(3); // Second highest mem (20)
      expect(topProcs[0]).toEqual({
        pid: 2,
        name: 'proc2',
        mem: 30,
        memRss: 300,
        memVsz: 3000,
      });
    });

    it('should throw and log if systeminformation fails', async () => {
      const error = new Error('SI Error');
      (si.processes as unknown as { mockRejectedValue: (v: unknown) => void }).mockRejectedValue(
        error
      );

      await expect(memoryService.getTopMemoryProcesses()).rejects.toThrow('SI Error');
    });
  });
});
