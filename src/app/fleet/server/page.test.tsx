import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetServerPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/server',
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

vi.mock('@/modules/fleet/ui/operations/FrpServerControl', () => ({
  FrpServerControl: () => <div data-testid="frp-control">frp</div>,
}));

vi.mock('@/modules/fleet/ui/operations/PreflightReport', () => ({
  PreflightReport: () => <div data-testid="preflight">preflight</div>,
}));

describe('FleetServerPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts with FrpServerControl and PreflightReport', async () => {
    await act(async () => {
      render(<FleetServerPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('frp-control')).toBeDefined();
    });
    expect(screen.getByTestId('preflight')).toBeDefined();
  });
});
