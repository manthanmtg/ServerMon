import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import UpdateWidget from './UpdateWidget';

const mockSnapshot = {
  counts: {
    security: 2,
    regular: 5,
    language: 1,
  },
  pendingRestart: true,
};

describe('UpdateWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders nothing initially when snapshot is null', () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    } as Response);

    const { container } = render(<UpdateWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "System Secure" when there are no updates and no pending restart', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        counts: { security: 0, regular: 0, language: 0 },
        pendingRestart: false,
      }),
    } as Response);

    await act(async () => {
      render(<UpdateWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('System Secure')).toBeDefined();
    });
  });

  it('renders updates and restart badges when present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSnapshot,
    } as Response);

    await act(async () => {
      render(<UpdateWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('Updates')).toBeDefined();
    });

    // Total updates = 2+5+1 = 8
    expect(screen.getByText('8')).toBeDefined();

    // Security count
    expect(screen.getByText('Security')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();

    // Packages count
    expect(screen.getByText('Packages')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();

    // Reboot badge
    expect(screen.getByText('Reboot')).toBeDefined();
  });

  it('handles fetch errors silently', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('API Error'));

    const { container } = render(<UpdateWidget />);

    await act(async () => {
      // Allow any pending promises to flush
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.firstChild).toBeNull();
  });
});
