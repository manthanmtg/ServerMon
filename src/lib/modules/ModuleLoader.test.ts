/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Module } from '@/types/module';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockRegister = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockGetAllModules = vi.fn();
const mockLoggerInfo = vi.fn();

vi.mock('../logger', () => ({
  createLogger: vi.fn(() => ({
    info: mockLoggerInfo,
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('./ModuleRegistry', () => ({
  moduleRegistry: {
    register: mockRegister,
    start: mockStart,
    getAllModules: mockGetAllModules,
  },
}));

const makeModule = (id: string): Module => ({
  id,
  name: `Module ${id}`,
  version: '1.0.0',
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ModuleLoader - initializeModules()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all core modules', async () => {
    const fakeModules = [makeModule('health'), makeModule('metrics'), makeModule('terminal')];

    vi.doMock('@/modules', () => ({ coreModules: fakeModules }));

    // Re-import with fresh module state
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock('./ModuleRegistry', () => ({
      moduleRegistry: {
        register: mockRegister,
        start: mockStart,
        getAllModules: mockGetAllModules,
      },
    }));
    vi.doMock('@/modules', () => ({ coreModules: fakeModules }));

    mockGetAllModules.mockReturnValue(fakeModules);

    const { initializeModules } = await import('./ModuleLoader');

    await initializeModules();

    expect(mockRegister).toHaveBeenCalledTimes(3);
    expect(mockRegister).toHaveBeenCalledWith(fakeModules[0]);
    expect(mockRegister).toHaveBeenCalledWith(fakeModules[1]);
    expect(mockRegister).toHaveBeenCalledWith(fakeModules[2]);
  });

  it('starts all registered modules after registration', async () => {
    const fakeModules = [makeModule('alpha'), makeModule('beta')];

    vi.resetModules();
    vi.doMock('./ModuleRegistry', () => ({
      moduleRegistry: {
        register: mockRegister,
        start: mockStart,
        getAllModules: mockGetAllModules,
      },
    }));
    vi.doMock('@/modules', () => ({ coreModules: fakeModules }));

    mockGetAllModules.mockReturnValue(fakeModules);

    const { initializeModules } = await import('./ModuleLoader');

    await initializeModules();

    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart).toHaveBeenCalledWith('alpha');
    expect(mockStart).toHaveBeenCalledWith('beta');
  });

  it('logs initialization message', async () => {
    const fakeModules: Module[] = [];

    vi.resetModules();
    vi.doMock('./ModuleRegistry', () => ({
      moduleRegistry: {
        register: mockRegister,
        start: mockStart,
        getAllModules: mockGetAllModules,
      },
    }));
    vi.doMock('@/modules', () => ({ coreModules: fakeModules }));

    mockGetAllModules.mockReturnValue([]);

    const { initializeModules } = await import('./ModuleLoader');

    await initializeModules();

    expect(mockLoggerInfo).toHaveBeenCalledWith('--- Initializing Modules ---');
  });

  it('handles empty coreModules gracefully', async () => {
    vi.resetModules();
    vi.doMock('./ModuleRegistry', () => ({
      moduleRegistry: {
        register: mockRegister,
        start: mockStart,
        getAllModules: mockGetAllModules,
      },
    }));
    vi.doMock('@/modules', () => ({ coreModules: [] }));

    mockGetAllModules.mockReturnValue([]);

    const { initializeModules } = await import('./ModuleLoader');

    await expect(initializeModules()).resolves.toBeUndefined();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
