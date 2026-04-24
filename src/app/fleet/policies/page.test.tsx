import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import FleetPoliciesPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/policies',
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

vi.mock('@/modules/fleet/ui/operations/AccessPolicyEditor', () => ({
  AccessPolicyEditor: () => <div data-testid="access-editor">access</div>,
}));

vi.mock('@/modules/fleet/ui/operations/ResourceGuardSettings', () => ({
  ResourceGuardSettings: () => <div data-testid="resource-settings">rps</div>,
}));

describe('FleetPoliciesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts with Access tab shown by default and switches to Resource guards', async () => {
    await act(async () => {
      render(<FleetPoliciesPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('access-editor')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Resource guards'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('resource-settings')).toBeDefined();
    });
  });
});
