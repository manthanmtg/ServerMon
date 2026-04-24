import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetBackupsPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fleet/backups',
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

vi.mock('@/modules/fleet/ui/operations/BackupRestorePanel', () => ({
  BackupRestorePanel: () => <div data-testid="backup-panel">backup</div>,
}));

describe('FleetBackupsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts with BackupRestorePanel', async () => {
    await act(async () => {
      render(<FleetBackupsPage />);
    });
    await waitFor(() => {
      expect(screen.getByTestId('backup-panel')).toBeDefined();
    });
  });
});
