import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionManager from './SessionManager';
import { SESSION_REFRESH_THROTTLE_MS, SESSION_TIMEOUT_MS } from '@/lib/session-config';

const mockPathname = vi.fn(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPathname.mockReturnValue('/dashboard');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost',
        replace: vi.fn(),
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
  });

  it('redirects to /login when the idle timer expires', async () => {
    render(<SessionManager />);

    await act(async () => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS);
    });

    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('resets the idle timer when user activity occurs', async () => {
    render(<SessionManager />);

    await act(async () => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS - 1_000);
    });

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    expect(window.location.replace).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('refreshes the session on activity and redirects on unauthorized responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);
    global.fetch = fetchMock;

    render(<SessionManager />);

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { cache: 'no-store' });

    await act(async () => {
      vi.advanceTimersByTime(SESSION_REFRESH_THROTTLE_MS + 1);
      window.dispatchEvent(new Event('keydown'));
    });

    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('redirects when a protected API call returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    render(<SessionManager />);

    await act(async () => {
      await window.fetch('/api/modules/network');
    });

    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('does not install session handling on public routes', async () => {
    mockPathname.mockReturnValue('/login');
    render(<SessionManager />);

    await act(async () => {
      vi.advanceTimersByTime(SESSION_TIMEOUT_MS);
      await window.fetch('/api/auth/verify', { method: 'POST' });
    });

    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
