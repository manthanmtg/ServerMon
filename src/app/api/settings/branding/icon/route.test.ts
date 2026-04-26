/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockFindById } = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockFindById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/BrandSettings', () => ({
  default: {
    findById: mockFindById,
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

function makeRequest() {
  return new Request('http://localhost/api/settings/branding/icon');
}

describe('GET /api/settings/branding/icon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the uploaded branding logo as the favicon', async () => {
    const logoBody = Buffer.from('logo');
    const logoBase64 = `data:image/png;base64,${logoBody.toString('base64')}`;
    mockFindById.mockReturnValue({ lean: () => Promise.resolve({ logoBase64 }) });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('logo');
  });

  it('redirects to the default icon when no uploaded logo exists', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.resolve({ logoBase64: '' }) });

    const response = await GET(makeRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/icon.png');
  });

  it('redirects to the default icon when branding lookup fails', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.reject(new Error('db error')) });

    const response = await GET(makeRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/icon.png');
  });
});
