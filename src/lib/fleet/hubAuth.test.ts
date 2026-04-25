import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFindOne, mockSave } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockSave: vi.fn(),
}));

vi.mock('@/models/FrpServerState', () => {
  class FakeFrpServerState {
    public key?: string;
    public authTokenHash?: string;
    public authTokenPrefix?: string;
    constructor(doc: Record<string, unknown>) {
      Object.assign(this, doc);
    }
    save = mockSave;
    static findOne = mockFindOne;
  }
  return { default: FakeFrpServerState };
});

import { getOrCreateHubAuthToken } from './hubAuth';

const ORIGINAL_ENV = process.env;

describe('getOrCreateHubAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    process.env = { ...ORIGINAL_ENV };
    delete process.env.FLEET_HUB_AUTH_TOKEN;
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns FLEET_HUB_AUTH_TOKEN when set, without touching the DB', async () => {
    process.env.FLEET_HUB_AUTH_TOKEN = 'env-override';
    const token = await getOrCreateHubAuthToken();
    expect(token).toBe('env-override');
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('ignores empty FLEET_HUB_AUTH_TOKEN and falls back to the DB', async () => {
    process.env.FLEET_HUB_AUTH_TOKEN = '   ';
    mockFindOne.mockResolvedValue({
      authTokenHash: 'persisted-token',
      save: mockSave,
    });
    const token = await getOrCreateHubAuthToken();
    expect(token).toBe('persisted-token');
  });

  it('returns the persisted authTokenHash when one already exists', async () => {
    mockFindOne.mockResolvedValue({
      authTokenHash: 'persisted-token',
      save: mockSave,
    });
    const token = await getOrCreateHubAuthToken();
    expect(token).toBe('persisted-token');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('generates and persists a token when none exists on the document', async () => {
    const stateDoc: {
      authTokenHash?: string;
      authTokenPrefix?: string;
      save: typeof mockSave;
    } = { save: mockSave };
    mockFindOne.mockResolvedValue(stateDoc);

    const token = await getOrCreateHubAuthToken();

    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(20);
    expect(stateDoc.authTokenHash).toBe(token);
    expect(stateDoc.authTokenPrefix).toBe(token.slice(0, 8));
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('creates a new state document via the constructor when findOne returns null', async () => {
    mockFindOne.mockResolvedValue(null);
    const token = await getOrCreateHubAuthToken();
    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(20);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('returns "pending" if the DB throws (test/legacy fallback)', async () => {
    mockFindOne.mockRejectedValue(new Error('no db'));
    const token = await getOrCreateHubAuthToken();
    expect(token).toBe('pending');
  });
});
