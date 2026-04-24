import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetNginxPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/nginx',
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

vi.mock('@/modules/fleet/ui/operations/NginxManager', () => ({
  NginxManager: () => <div data-testid="nginx-manager">nginx</div>,
}));

vi.mock('@/modules/fleet/ui/operations/CertificateManager', () => ({
  CertificateManager: () => <div data-testid="cert-manager">certs</div>,
}));

describe('FleetNginxPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts with NginxManager and CertificateManager', async () => {
    await act(async () => {
      render(<FleetNginxPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('nginx-manager')).toBeDefined();
    });
    expect(screen.getByTestId('cert-manager')).toBeDefined();
  });
});
