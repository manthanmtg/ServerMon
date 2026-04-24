import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetEndpointRunnerPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/endpoint-runner',
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

vi.mock('@/modules/fleet/ui/operations/FleetEndpointRunner', () => ({
  FleetEndpointRunner: () => <div data-testid="endpoint-runner">endpoint runner</div>,
}));

describe('FleetEndpointRunnerPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts wrapping FleetEndpointRunner in ProShell', async () => {
    await act(async () => {
      render(<FleetEndpointRunnerPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('endpoint-runner')).toBeDefined();
    });
  });
});
