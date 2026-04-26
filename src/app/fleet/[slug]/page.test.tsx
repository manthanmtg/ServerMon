import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import NodeDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'edge-01' }),
  usePathname: () => '/fleet/edge-01',
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

vi.mock('@/modules/fleet/ui/details/NodeStatusPanel', () => ({
  NodeStatusPanel: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="overview">overview:{nodeId}</div>
  ),
}));
vi.mock('@/modules/fleet/ui/details/ProxyRuleTable', () => ({
  ProxyRuleTable: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="proxies">proxies:{nodeId}</div>
  ),
}));
vi.mock('@/modules/fleet/ui/details/PublicRouteTable', () => ({
  PublicRouteTable: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="routes">routes:{nodeId}</div>
  ),
}));
vi.mock('@/modules/fleet/ui/details/NodeLogsView', () => ({
  NodeLogsView: ({ nodeId }: { nodeId: string }) => <div data-testid="logs">logs:{nodeId}</div>,
}));
vi.mock('@/modules/fleet/ui/details/NodeHardwareCharts', () => ({
  NodeHardwareCharts: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="hardware">hardware:{nodeId}</div>
  ),
}));
vi.mock('@/modules/fleet/ui/details/NodeTerminal', () => ({
  NodeTerminal: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="terminal">terminal:{nodeId}</div>
  ),
}));
vi.mock('@/modules/fleet/ui/details/RemoteProcessTable', () => ({
  RemoteProcessTable: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="processes">processes:{nodeId}</div>
  ),
}));

describe('NodeDetailPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _id: 'node-abc',
          name: 'Edge One',
          slug: 'edge-01',
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders tabs and shows Overview by default after fetch', async () => {
    await act(async () => {
      render(<NodeDetailPage />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Overview' })).toBeDefined();
    });
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Proxies' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Public Routes' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Processes' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Logs' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Hardware' })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('overview').textContent).toBe('overview:node-abc');
    });
  });

  it('switches to Logs tab when clicked', async () => {
    await act(async () => {
      render(<NodeDetailPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('overview')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('logs').textContent).toBe('logs:node-abc');
    });
  });

  it('shows Node not found when slug has no match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Node not found' }),
      })
    );

    await act(async () => {
      render(<NodeDetailPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Node not found')).toBeDefined();
    });
  });

  it('shows HTTP error when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
    );

    await act(async () => {
      render(<NodeDetailPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeDefined();
    });
  });
});
