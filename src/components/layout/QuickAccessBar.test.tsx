import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import QuickAccessBar from './QuickAccessBar';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUsePathname = vi.fn(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
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

function makeItem(id: string, label: string, href: string) {
  return { id, href, label, icon: id };
}

const sampleItems = [
  makeItem('terminal', 'Terminal', '/terminal'),
  makeItem('docker', 'Docker', '/docker'),
  makeItem('services', 'Services', '/services'),
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('QuickAccessBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/dashboard');
  });

  it('renders nothing before the API response resolves', () => {
    // Never resolving promise = loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<QuickAccessBar />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the settings link when the API returns no items', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Pin modules in Settings/)).toBeDefined();
    });
  });

  it('links the settings prompt to /settings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      const link = screen.getByText(/Pin modules in Settings/).closest('a');
      expect(link).toBeDefined();
      expect(link?.getAttribute('href')).toBe('/settings');
    });
  });

  it('renders item labels after the API responds with items', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleItems }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeDefined();
      expect(screen.getByText('Docker')).toBeDefined();
      expect(screen.getByText('Services')).toBeDefined();
    });
  });

  it('renders item hrefs as anchor links', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [makeItem('terminal', 'Terminal', '/terminal')] }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      const links = document.querySelectorAll('a[href="/terminal"]');
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it('marks the active item when pathname matches the item href', async () => {
    mockUsePathname.mockReturnValue('/terminal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleItems }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      const terminalLinks = document.querySelectorAll('a[href="/terminal"]');
      // The active link should carry the primary bg class
      const activeLink = Array.from(terminalLinks).find((el) =>
        el.className.includes('bg-primary')
      );
      expect(activeLink).toBeDefined();
    });
  });

  it('does not mark non-active items as active', async () => {
    mockUsePathname.mockReturnValue('/terminal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleItems }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      const dockerLinks = document.querySelectorAll('a[href="/docker"]');
      const activeLink = Array.from(dockerLinks).find((el) => el.className.includes('bg-primary'));
      expect(activeLink).toBeUndefined();
    });
  });

  it('shows settings link when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Pin modules in Settings/)).toBeDefined();
    });
  });

  it('shows settings link when API returns null items field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Pin modules in Settings/)).toBeDefined();
    });
  });

  it('uses a fallback icon for unrecognised module ids', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [makeItem('unknown-module-xyz', 'Mystery', '/mystery')],
      }),
    });

    await act(async () => {
      render(<QuickAccessBar />);
    });

    // The component should still render without throwing
    await waitFor(() => {
      expect(screen.getByText('Mystery')).toBeDefined();
    });
  });
});
