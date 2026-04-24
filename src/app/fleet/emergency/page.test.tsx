import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetEmergencyPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/emergency',
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

vi.mock('@/modules/fleet/ui/operations/EmergencyControls', () => ({
  EmergencyControls: () => <div data-testid="emergency">emergency</div>,
}));

vi.mock('@/modules/fleet/ui/operations/FleetAlertsPanel', () => ({
  FleetAlertsPanel: () => <div data-testid="alerts">alerts</div>,
}));

describe('FleetEmergencyPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts with EmergencyControls and FleetAlertsPanel', async () => {
    await act(async () => {
      render(<FleetEmergencyPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('alerts')).toBeDefined();
    });
    expect(screen.getByTestId('emergency')).toBeDefined();
  });
});
