/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetAllModules, mockInitializeModules } = vi.hoisted(() => ({
  mockGetAllModules: vi.fn(),
  mockInitializeModules: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/modules/ModuleRegistry', () => ({
  moduleRegistry: { getAllModules: mockGetAllModules },
}));
vi.mock('@/lib/modules/ModuleLoader', () => ({
  initializeModules: mockInitializeModules,
}));

import { GET } from './route';

describe('GET /api/modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of registered modules', async () => {
    mockGetAllModules.mockReturnValue([
      { id: 'health', name: 'Health', version: '1.0.0', description: 'Health check' },
      { id: 'docker', name: 'Docker', version: '1.0.0', description: 'Docker management' },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.modules).toHaveLength(2);
    expect(json.modules[0].id).toBe('health');
  });

  it('returns empty modules list', async () => {
    mockGetAllModules.mockReturnValue([]);
    const res = await GET();
    const json = await res.json();
    expect(json.modules).toEqual([]);
  });

  it('calls initializeModules on every request', async () => {
    mockGetAllModules.mockReturnValue([]);
    await GET();
    expect(mockInitializeModules).toHaveBeenCalled();
  });

  it('sets isEnabled to true for all modules', async () => {
    mockGetAllModules.mockReturnValue([
      { id: 'health', name: 'Health', version: '1.0.0', description: '' },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.modules[0].isEnabled).toBe(true);
  });

  it('includes required fields in each module', async () => {
    mockGetAllModules.mockReturnValue([
      { id: 'test', name: 'Test', version: '2.0.0', description: 'A test module' },
    ]);
    const res = await GET();
    const json = await res.json();
    const mod = json.modules[0];
    expect(mod).toHaveProperty('id');
    expect(mod).toHaveProperty('name');
    expect(mod).toHaveProperty('version');
    expect(mod).toHaveProperty('description');
    expect(mod).toHaveProperty('isEnabled');
  });
});
