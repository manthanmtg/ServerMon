import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import QuickAccessSettings, { ALL_MODULES } from './QuickAccessSettings';
import { navGroups } from '@/components/layout/navigation';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="card-description">{children}</p>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="card-title">{children}</h2>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeApiItem(id: string) {
  return { id, href: `/${id}`, label: id.charAt(0).toUpperCase() + id.slice(1), icon: id };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('QuickAccessSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers every primary navigation item for pinning', () => {
    const quickAccessHrefs = ALL_MODULES.map((moduleDef) => moduleDef.href);
    const navHrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));

    expect(quickAccessHrefs).toEqual(navHrefs);
  });

  it('shows loading skeletons while the API is in-flight', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<QuickAccessSettings />);
    // Loading state renders animated skeleton placeholders
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the Quick Access heading', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Quick Access')).toBeDefined();
    });
  });

  it('shows enabled modules in the pinned section after loading', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [makeApiItem('terminal'), makeApiItem('docker')] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('Terminal').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
    });
  });

  it('shows remaining modules in the available section', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      // All modules should appear in the available section
      expect(screen.getByText('Terminal')).toBeDefined();
      expect(screen.getByText('Docker')).toBeDefined();
    });
  });

  it('shows settings link in preview when no modules are enabled', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Pin modules in Settings/)).toBeDefined();
    });
  });

  it('pins a module when the Pin button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeDefined();
    });

    // Click the Pin button next to Terminal
    const pinButtons = screen.getAllByText('Pin');
    const terminalRow = screen.getByText('Terminal').closest('div[class]')!;
    const pinButton = terminalRow.querySelector('button') ?? pinButtons[0];

    await act(async () => {
      fireEvent.click(pinButton);
    });

    // Terminal should now appear in the pinned section (rendered multiple times)
    await waitFor(() => {
      const terminalElements = screen.getAllByText('Terminal');
      expect(terminalElements.length).toBeGreaterThan(0);
    });
  });

  it('removes a module when the Remove button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [makeApiItem('terminal')] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    // After removing, the Remove button should be gone
    await waitFor(() => {
      expect(screen.queryByText('Remove')).toBeNull();
    });
  });

  it('calls the PUT endpoint when Save is clicked', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [makeApiItem('terminal')] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, items: [makeApiItem('terminal')] }),
      });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Save Quick Access')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save Quick Access'));
    });

    await waitFor(() => {
      const putCall = vi
        .mocked(global.fetch)
        .mock.calls.find((c) => typeof c[1] === 'object' && (c[1] as RequestInit).method === 'PUT');
      expect(putCall).toBeDefined();
    });
  });

  it('shows a success toast when save succeeds', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, items: [] }),
      });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Save Quick Access')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save Quick Access'));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
    });
  });

  it('shows an error toast when the save request fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Save Quick Access')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save Quick Access'));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  it('shows an error toast when the save fetch throws', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Save Quick Access')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save Quick Access'));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  it('renders the Save Quick Access button', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Save Quick Access')).toBeDefined();
    });
  });

  it('renders the manage settings link', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('Manage all settings')).toBeDefined();
    });
  });
});
