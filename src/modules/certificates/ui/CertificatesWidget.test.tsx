import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import CertificatesWidget from './CertificatesWidget';

const mockSnapshot = {
  source: 'live',
  summary: {
    total: 5,
    valid: 3,
    expiringSoon: 1,
    expired: 1,
    nearestExpiry: 5,
    nearestDomain: 'example.com',
  },
};

describe('CertificatesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading state initially', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {})); // Never resolves
    const { container } = render(<CertificatesWidget />);
    expect(container.querySelector('.animate-spin')).toBeDefined();
  });

  it('renders certificate counts correctly', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSnapshot,
    } as Response);

    await act(async () => {
      render(<CertificatesWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeDefined();
    });

    expect(screen.getByText('3')).toBeDefined(); // Valid
    expect(screen.getAllByText('1')).toHaveLength(2); // Expiring and Expired both have 1
    expect(screen.getByText('5')).toBeDefined(); // Total
  });

  it('renders nearest expiry warning', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSnapshot,
    } as Response);

    await act(async () => {
      render(<CertificatesWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText(/example.com: 5d until expiry/i)).toBeDefined();
    });
  });

  it('handles fetch failure gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Fetch failed'));

    await act(async () => {
      render(<CertificatesWidget />);
    });

    // Should not crash and should update loading state
    await waitFor(() => {
      expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    });
  });
});
