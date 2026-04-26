import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import ProShell from './ProShell';
import { ToastProvider } from '@/components/ui/toast';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockPathname = vi.fn(() => '/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/ThemeContext', () => ({
  useTheme: () => ({ theme: { id: 'default', mode: 'dark', colors: {} } }),
}));

vi.mock('@/lib/BrandContext', () => ({
  useBrand: () => ({
    settings: { appName: 'ServerMon', logoUrl: '', pageTitle: 'ServerMon' },
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./ThemeSelector', () => ({
  default: () => <div data-testid="theme-selector" />,
}));

vi.mock('@/components/layout/ThemeSelector', () => ({
  default: () => <div data-testid="theme-selector" />,
}));

vi.mock('@/components/layout/QuickAccessBar', () => ({
  default: () => <div data-testid="quick-access-bar" />,
}));

vi.mock('@/components/layout/CommandSearch', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="command-search">
        <button onClick={onClose}>Close command search</button>
      </div>
    ) : null,
}));

vi.mock('@/components/ui/ConfirmationModal', () => ({
  default: ({
    isOpen,
    onCancel,
    onConfirm,
    title,
  }: {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <span>{title}</span>
        <button onClick={onCancel} data-testid="modal-cancel">
          Cancel
        </button>
        <button onClick={onConfirm} data-testid="modal-confirm">
          Confirm
        </button>
      </div>
    ) : null,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderProShell(props: Partial<React.ComponentProps<typeof ProShell>> = {}) {
  return render(
    <ToastProvider>
      <ProShell title="Dashboard" {...props}>
        <div data-testid="content">children</div>
      </ProShell>
    </ToastProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/dashboard');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    // Mock localStorage
    const mockStorage: Record<string, string> = {};
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn((key) => mockStorage[key] || null),
        setItem: vi.fn((key, value) => {
          mockStorage[key] = value.toString();
        }),
        clear: vi.fn(() => {
          for (const key in mockStorage) delete mockStorage[key];
        }),
        removeItem: vi.fn((key) => delete mockStorage[key]),
        length: 0,
        key: vi.fn(),
      },
      writable: true,
    });
  });

  it('renders the title in the header', () => {
    renderProShell({ title: 'My Page' });
    expect(screen.getAllByText('My Page').length).toBeGreaterThan(0);
  });

  it('renders subtitle when provided', () => {
    renderProShell({ title: 'Terminal', subtitle: 'Remote Shell' });
    expect(screen.getByText('Remote Shell')).toBeDefined();
  });

  it('does not render subtitle when omitted', () => {
    renderProShell({ title: 'Dashboard' });
    expect(screen.queryByTestId('subtitle')).toBeNull();
  });

  it('renders children content', () => {
    renderProShell();
    expect(screen.getByTestId('content')).toBeDefined();
  });

  it('renders navigation links in the desktop sidebar', () => {
    renderProShell();
    expect(screen.getAllByText('Terminal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });

  it('renders Docker in the sidebar navigation', () => {
    renderProShell({ title: 'Processes' });
    expect(screen.getByText('Docker')).toBeDefined();
  });

  it('renders the Log out button', () => {
    renderProShell();
    expect(screen.getAllByText('Log out').length).toBeGreaterThan(0);
  });

  it('renders ThemeSelector in the header', () => {
    renderProShell();
    expect(screen.getByTestId('theme-selector')).toBeDefined();
  });

  it('opens command search with the header search button', () => {
    renderProShell();
    fireEvent.click(screen.getByLabelText('Open search'));
    expect(screen.getByTestId('command-search')).toBeDefined();
  });

  it('opens command search with Cmd+K', () => {
    renderProShell();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-search')).toBeDefined();
  });

  it('opens command search with Ctrl+K', () => {
    renderProShell();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('command-search')).toBeDefined();
  });

  it('can close command search from the overlay', () => {
    renderProShell();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.click(screen.getByText('Close command search'));
    expect(screen.queryByTestId('command-search')).toBeNull();
  });

  it('shows QuickAccessBar on the dashboard page', () => {
    mockPathname.mockReturnValue('/dashboard');
    renderProShell();
    expect(screen.getByTestId('quick-access-bar')).toBeDefined();
  });

  it('hides QuickAccessBar on non-dashboard pages', () => {
    mockPathname.mockReturnValue('/terminal');
    renderProShell();
    expect(screen.queryByTestId('quick-access-bar')).toBeNull();
  });

  it('calls logout API and redirects on log out', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    renderProShell();

    const logoutButtons = screen.getAllByText('Log out');
    await act(async () => {
      fireEvent.click(logoutButtons[0]);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('opens the mobile sidebar overlay when menu button is clicked', () => {
    renderProShell();
    const menuBtn = screen.getByLabelText('Toggle sidebar');
    fireEvent.click(menuBtn);
    const overlays = document.querySelectorAll('.fixed.inset-0');
    expect(overlays.length).toBeGreaterThan(0);
  });

  it('renders the toggle sidebar button', () => {
    renderProShell();
    expect(screen.getByLabelText('Toggle sidebar')).toBeDefined();
  });

  it('renders the brand title from BrandContext', () => {
    renderProShell();
    expect(screen.getByText('ServerMon')).toBeDefined();
  });

  it('shows reboot confirmation modal when reboot button is clicked', () => {
    renderProShell();
    const rebootBtn = screen.getByTitle('Reboot System');
    fireEvent.click(rebootBtn);
    expect(screen.getByTestId('confirmation-modal')).toBeDefined();
    expect(screen.getByText('System Reboot')).toBeDefined();
  });

  it('cancels reboot modal on cancel click', async () => {
    renderProShell();
    const rebootBtn = screen.getByTitle('Reboot System');
    fireEvent.click(rebootBtn);
    expect(screen.getByTestId('confirmation-modal')).toBeDefined();
    fireEvent.click(screen.getByTestId('modal-cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirmation-modal')).toBeNull();
    });
  });

  it('calls reboot API on confirmation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Rebooting...' }),
    });
    renderProShell();
    const rebootBtn = screen.getByTitle('Reboot System');
    fireEvent.click(rebootBtn);
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-confirm'));
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/system/reboot', { method: 'POST' });
    });
  });

  it('highlights the active nav link matching current pathname', () => {
    mockPathname.mockReturnValue('/terminal');
    renderProShell();
    const terminalLinks = screen.getAllByText('Terminal');
    expect(terminalLinks.length).toBeGreaterThan(0);
  });

  it('marks the active nav item based on current pathname', () => {
    mockPathname.mockReturnValue('/terminal');
    renderProShell();
    const terminalLink = document.querySelector('a[href="/terminal"]');
    expect(terminalLink?.className).toContain('bg-primary');
  });

  it('does not mark inactive nav items as active', () => {
    mockPathname.mockReturnValue('/terminal');
    renderProShell();
    const dockerLink = document.querySelector('a[href="/docker"]');
    expect(dockerLink?.className).not.toContain('bg-primary');
  });

  it('updates document title using pageTitle from brand settings', () => {
    renderProShell({ title: 'Dashboard' });
    expect(document.title).toContain('Dashboard');
  });

  it('renders User Guide link', () => {
    renderProShell();
    expect(screen.getByText('User Guide')).toBeDefined();
  });

  it('renders the header content when provided', () => {
    renderProShell({ headerContent: <span>Custom Header</span> });
    expect(screen.getByText('Custom Header')).toBeDefined();
  });
});
