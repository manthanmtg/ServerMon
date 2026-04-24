import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetRouteDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'r1' }),
  usePathname: () => '/fleet/routes/r1',
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

vi.mock('@/modules/fleet/ui/operations/GeneratedDocsView', () => ({
  GeneratedDocsView: ({ routeId }: { routeId: string }) => (
    <div data-testid="docs">docs:{routeId}</div>
  ),
}));

vi.mock('@/modules/fleet/ui/operations/ConfigRevisionHistory', () => ({
  ConfigRevisionHistory: ({ defaultTargetId }: { defaultTargetId: string }) => (
    <div data-testid="revisions">revisions:{defaultTargetId}</div>
  ),
}));

describe('FleetRouteDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          route: {
            _id: 'r1',
            name: 'App',
            slug: 'app',
            domain: 'app.example.com',
          },
        }),
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts and renders docs + revision history for route', async () => {
    await act(async () => {
      render(<FleetRouteDetailPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('docs').textContent).toBe('docs:r1');
    });
    expect(screen.getByTestId('revisions').textContent).toBe('revisions:r1');
  });
});
