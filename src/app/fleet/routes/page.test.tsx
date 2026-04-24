import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetRoutesPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/routes',
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

describe('FleetRoutesPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [], total: 0 }),
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts and shows empty state', async () => {
    await act(async () => {
      render(<FleetRoutesPage />);
    });
    await waitFor(() => {
      expect(screen.getByText(/No public routes yet/)).toBeDefined();
    });
  });
});
