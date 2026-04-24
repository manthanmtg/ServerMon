import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/BrandContext', () => ({
  useBrand: () => ({
    settings: { pageTitle: 'ServerMon', logoBase64: null },
    refresh: vi.fn(),
  }),
  BrandProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('FleetPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nodes: [], total: 0 }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the Fleet title, stats banner, search, and empty grid', async () => {
    await act(async () => {
      render(<FleetPage />);
    });

    // Title in header
    expect(screen.getAllByText('Fleet').length).toBeGreaterThan(0);
    // Stats banner labels
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('Online')).toBeDefined();
    // Search inputs
    expect(screen.getByPlaceholderText(/Search by name/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Tag filter/i)).toBeDefined();
    // Onboard agent button
    expect(screen.getByText(/Onboard agent/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/No nodes yet/)).toBeDefined();
    });
  });
});
