import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetTemplatesPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/templates',
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

vi.mock('@/modules/fleet/ui/operations/RouteTemplatePicker', () => ({
  RouteTemplatePicker: () => <div data-testid="template-picker">templates</div>,
}));

describe('FleetTemplatesPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts with RouteTemplatePicker', async () => {
    await act(async () => {
      render(<FleetTemplatesPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('template-picker')).toBeDefined();
    });
  });
});
