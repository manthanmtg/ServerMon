/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRedirect = vi.fn((path: string): never => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

const mockConnectDB = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/db', () => ({ default: mockConnectDB }));

const mockCountDocuments = vi.fn();
vi.mock('@/models/User', () => ({
  default: { countDocuments: mockCountDocuments },
}));

const mockGetSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RootPage redirect logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /setup when no users exist', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockGetSession.mockResolvedValue(null);

    const { default: RootPage } = await import('./page');
    await expect(RootPage()).rejects.toThrow('REDIRECT:/setup');
    expect(mockRedirect).toHaveBeenCalledWith('/setup');
  });

  it('redirects to /dashboard when users exist and session is active', async () => {
    mockCountDocuments.mockResolvedValue(1);
    mockGetSession.mockResolvedValue({ userId: 'user-1', email: 'a@b.com' });

    const { default: RootPage } = await import('./page');
    await expect(RootPage()).rejects.toThrow('REDIRECT:/dashboard');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to /login when users exist but no session', async () => {
    mockCountDocuments.mockResolvedValue(2);
    mockGetSession.mockResolvedValue(null);

    const { default: RootPage } = await import('./page');
    await expect(RootPage()).rejects.toThrow('REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /setup when DB connection fails', async () => {
    mockConnectDB.mockRejectedValue(new Error('DB connection failed'));
    mockGetSession.mockResolvedValue(null);

    const { default: RootPage } = await import('./page');
    await expect(RootPage()).rejects.toThrow('REDIRECT:/setup');
    expect(mockRedirect).toHaveBeenCalledWith('/setup');
  });

  it('redirects to /setup when countDocuments throws', async () => {
    mockConnectDB.mockResolvedValue(undefined);
    mockCountDocuments.mockRejectedValue(new Error('Query failed'));
    mockGetSession.mockResolvedValue(null);

    const { default: RootPage } = await import('./page');
    await expect(RootPage()).rejects.toThrow('REDIRECT:/setup');
    expect(mockRedirect).toHaveBeenCalledWith('/setup');
  });
});
