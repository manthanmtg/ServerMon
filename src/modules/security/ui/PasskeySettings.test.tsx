import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock @simplewebauthn/browser before importing component
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
}));

// Mock the logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import PasskeySettings from './PasskeySettings';
import { startRegistration } from '@simplewebauthn/browser';

const mockPasskeys = [
  { id: 'abc123def456', createdAt: '2026-01-15T10:00:00Z' },
  { id: 'xyz789uvw012', createdAt: '2026-02-20T14:30:00Z' },
];

describe('PasskeySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ passkeys: mockPasskeys }),
    });
  });

  it('shows loading spinner initially', () => {
    let resolve!: (v: unknown) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    render(<PasskeySettings />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    act(() => {
      resolve({ ok: true, json: async () => ({ passkeys: [] }) });
    });
  });

  it('renders Passkeys heading', async () => {
    await act(async () => {
      render(<PasskeySettings />);
    });
    await waitFor(() => expect(screen.getByText('Passkeys')).toBeDefined());
  });

  it('renders Add Passkey button', async () => {
    await act(async () => {
      render(<PasskeySettings />);
    });
    await waitFor(() => expect(screen.getByText('Add Passkey')).toBeDefined());
  });

  it('shows empty state when no passkeys', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ passkeys: [] }),
    });
    await act(async () => {
      render(<PasskeySettings />);
    });
    await waitFor(() => expect(screen.getByText('No passkeys registered')).toBeDefined());
  });

  it('lists passkeys after loading', async () => {
    await act(async () => {
      render(<PasskeySettings />);
    });
    await waitFor(() => {
      const items = screen.getAllByText('Registered Passkey');
      expect(items).toHaveLength(2);
    });
  });

  it('shows truncated passkey ID', async () => {
    await act(async () => {
      render(<PasskeySettings />);
    });
    // pk.id.slice(0, 8) of 'abc123def456' = 'abc123de'
    await waitFor(() => {
      expect(screen.getByText('ID: abc123de...')).toBeDefined();
    });
  });

  it('handles fetch failure for loading passkeys gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<PasskeySettings />);
    });
    await waitFor(() => {
      // Spinner should be gone after error; empty state or no passkeys shown
      expect(document.querySelector('.animate-spin')).toBeNull();
    });
  });

  it('handles non-ok response when loading passkeys', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });
    await act(async () => {
      render(<PasskeySettings />);
    });
    await waitFor(() => {
      expect(document.querySelector('.animate-spin')).toBeNull();
    });
  });

  describe('handleRegister', () => {
    it('shows error message when registration options fetch fails', async () => {
      global.fetch = vi
        .fn()
        // First call: load passkeys
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) })
        // Second call: register options
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getByText('Add Passkey'));
      await act(async () => {
        fireEvent.click(screen.getByText('Add Passkey'));
      });
      await waitFor(() =>
        expect(screen.getByText('Failed to get registration options')).toBeDefined()
      );
    });

    it('ignores NotAllowedError (user cancelled)', async () => {
      const notAllowedErr = Object.assign(new Error('User cancelled'), {
        name: 'NotAllowedError',
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'test' }) });
      vi.mocked(startRegistration).mockRejectedValueOnce(notAllowedErr);

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getByText('Add Passkey'));
      await act(async () => {
        fireEvent.click(screen.getByText('Add Passkey'));
      });
      // No error message should appear (user cancelled)
      await waitFor(() => {
        expect(screen.queryByText('User cancelled')).toBeNull();
      });
    });

    it('shows error for non-Error thrown during registration', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'test' }) });
      vi.mocked(startRegistration).mockRejectedValueOnce('string error');

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getByText('Add Passkey'));
      await act(async () => {
        fireEvent.click(screen.getByText('Add Passkey'));
      });
      await waitFor(() => expect(screen.getByText('Registration failed')).toBeDefined());
    });

    it('calls toast on successful registration', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'test' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) });
      vi.mocked(startRegistration).mockResolvedValueOnce({} as never);

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getByText('Add Passkey'));
      await act(async () => {
        fireEvent.click(screen.getByText('Add Passkey'));
      });
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Passkey added', variant: 'success' })
        )
      );
    });

    it('shows error when verify request fails', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ challenge: 'test' }) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
      vi.mocked(startRegistration).mockResolvedValueOnce({} as never);

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getByText('Add Passkey'));
      await act(async () => {
        fireEvent.click(screen.getByText('Add Passkey'));
      });
      await waitFor(() => expect(screen.getByText('Failed to verify registration')).toBeDefined());
    });
  });

  describe('handleDelete', () => {
    it('calls fetch DELETE when delete is confirmed', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: mockPasskeys }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) });

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getAllByTitle('Remove passkey'));
      await act(async () => {
        fireEvent.click(screen.getAllByTitle('Remove passkey')[0]);
      });
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/auth/passkey/delete',
          expect.objectContaining({ method: 'DELETE' })
        )
      );
    });

    it('does not call fetch when delete is cancelled', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: mockPasskeys }) });

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getAllByTitle('Remove passkey'));
      await act(async () => {
        fireEvent.click(screen.getAllByTitle('Remove passkey')[0]);
      });
      // Only 1 call (load passkeys); no DELETE call
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('calls toast with success after successful deletion', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: mockPasskeys }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: [] }) });

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getAllByTitle('Remove passkey'));
      await act(async () => {
        fireEvent.click(screen.getAllByTitle('Remove passkey')[0]);
      });
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Passkey removed', variant: 'success' })
        )
      );
    });

    it('calls toast with error when deletion fails', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: mockPasskeys }) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Permission denied' }) });

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getAllByTitle('Remove passkey'));
      await act(async () => {
        fireEvent.click(screen.getAllByTitle('Remove passkey')[0]);
      });
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Deletion failed', variant: 'destructive' })
        )
      );
    });

    it('calls toast with error when deletion throws', async () => {
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ passkeys: mockPasskeys }) })
        .mockRejectedValueOnce(new Error('Network failure'));

      await act(async () => {
        render(<PasskeySettings />);
      });
      await waitFor(() => screen.getAllByTitle('Remove passkey'));
      await act(async () => {
        fireEvent.click(screen.getAllByTitle('Remove passkey')[0]);
      });
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Error', variant: 'destructive' })
        )
      );
    });
  });
});
