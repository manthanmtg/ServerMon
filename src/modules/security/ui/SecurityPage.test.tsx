import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import SecurityPage from './SecurityPage';
import type { SecuritySnapshot } from '../types';

vi.mock('@/components/ui/skeleton', () => ({
  PageSkeleton: ({ statCards }: { statCards: number }) => (
    <div data-testid="page-skeleton" data-stat-cards={statCards}>
      Loading...
    </div>
  ),
}));

const mockSnapshot: SecuritySnapshot = {
  timestamp: new Date().toISOString(),
  source: 'live',
  score: 82,
  checks: [
    {
      id: 'ssh-root-login',
      category: 'SSH',
      title: 'Root login disabled',
      description: 'Root login should be disabled',
      status: 'pass',
      details: 'PermitRootLogin is set to no',
      severity: 'critical',
    },
    {
      id: 'ssh-password-auth',
      category: 'SSH',
      title: 'Password authentication',
      description: 'Password authentication should be disabled',
      status: 'fail',
      details: 'PasswordAuthentication is enabled',
      severity: 'high',
    },
    {
      id: 'firewall-enabled',
      category: 'Firewall',
      title: 'Firewall enabled',
      description: 'A firewall should be active',
      status: 'warn',
      details: 'UFW is installed but not active',
      severity: 'medium',
    },
    {
      id: 'updates-info',
      category: 'Updates',
      title: 'Pending updates',
      description: 'System has pending updates',
      status: 'info',
      details: '2 updates available',
      severity: 'info',
    },
    {
      id: 'audit-skip',
      category: 'Audit',
      title: 'Audit daemon',
      description: 'Auditd check skipped',
      status: 'skip',
      details: 'Not applicable',
      severity: 'low',
    },
  ],
  firewall: {
    available: true,
    backend: 'ufw',
    enabled: true,
    defaultIncoming: 'deny',
    defaultOutgoing: 'allow',
    rulesCount: 5,
  },
  fail2ban: {
    available: true,
    running: true,
    totalBanned: 12,
    jails: [
      {
        name: 'sshd',
        enabled: true,
        currentlyBanned: 3,
        totalBanned: 12,
        bannedIps: ['192.168.1.100', '10.0.0.50'],
      },
    ],
  },
  ssh: {
    permitRootLogin: 'no',
    passwordAuthentication: 'yes',
    port: '22',
    maxAuthTries: '3',
    pubkeyAuthentication: 'yes',
    x11Forwarding: 'no',
    allowedUsers: [],
    allowedGroups: [],
  },
  recentLogins: [
    {
      user: 'admin',
      ip: '192.168.1.1',
      timestamp: '2026-03-17 10:00:00',
      success: true,
      method: 'publickey',
    },
    {
      user: 'root',
      ip: '10.0.0.99',
      timestamp: '2026-03-17 09:30:00',
      success: false,
      method: 'password',
    },
  ],
  users: [],
  pendingUpdates: [
    {
      package: 'openssl',
      currentVersion: '3.0.2',
      newVersion: '3.0.11',
      isSecurity: true,
    },
  ],
  summary: {
    totalChecks: 5,
    passed: 1,
    failed: 1,
    warnings: 1,
    criticalIssues: 1,
    bannedIps: 3,
    pendingSecurityUpdates: 1,
  },
};

describe('SecurityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    }) as unknown as typeof fetch;
  });

  it('shows skeleton while loading', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch; // never resolves
    render(<SecurityPage />);
    expect(screen.getByTestId('page-skeleton')).toBeDefined();
  });

  it('renders security score after loading', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('82')).toBeDefined();
    });
  });

  it('renders summary stats', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getAllByText('Passed').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
      expect(screen.getByText('Warnings')).toBeDefined();
      expect(screen.getByText('Banned IPs')).toBeDefined();
      expect(screen.getByText('Security Updates')).toBeDefined();
      expect(screen.getByText('Firewall Rules')).toBeDefined();
    });
  });

  it('renders security checks grouped by category', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      // Categories appear as section headers
      expect(screen.getByText('SSH')).toBeDefined();
      expect(screen.getByText('Firewall')).toBeDefined();
      expect(screen.getByText('Updates')).toBeDefined();
      expect(screen.getByText('Audit')).toBeDefined();

      // Check titles
      expect(screen.getByText('Root login disabled')).toBeDefined();
      expect(screen.getByText('Password authentication')).toBeDefined();
    });
  });

  it('renders pass/fail/warn/info/skip status badges', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('Pass')).toBeDefined();
      expect(screen.getByText('Fail')).toBeDefined();
      expect(screen.getByText('Warning')).toBeDefined();
      expect(screen.getByText('Info')).toBeDefined();
      expect(screen.getByText('Skipped')).toBeDefined();
    });
  });

  it('renders Fail2Ban section when available', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('Fail2Ban')).toBeDefined();
      expect(screen.getByText('sshd')).toBeDefined();
      expect(screen.getByText('3 banned')).toBeDefined();
      expect(screen.getByText('192.168.1.100')).toBeDefined();
    });
  });

  it('renders SSH configuration section', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('SSH Configuration')).toBeDefined();
      expect(screen.getByText('Root Login')).toBeDefined();
      expect(screen.getByText('Password Auth')).toBeDefined();
    });
  });

  it('renders recent logins table', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('Recent Logins')).toBeDefined();
      expect(screen.getByText('admin')).toBeDefined();
      expect(screen.getByText('192.168.1.1')).toBeDefined();
      // Success badge for successful login
      expect(screen.getByText('Success')).toBeDefined();
    });
  });

  it('renders pending security updates', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('Pending Updates (1)')).toBeDefined();
      expect(screen.getByText('openssl')).toBeDefined();
      expect(screen.getByText('Security')).toBeDefined();
    });
  });

  it('calls fetch again when refresh button is clicked', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => expect(screen.getByTitle('Refresh')).toBeDefined());

    const fetchCallsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTitle('Refresh'));
    });
    await waitFor(() => {
      const fetchCallsAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(fetchCallsAfter).toBeGreaterThan(fetchCallsBefore);
    });
  });

  it('renders null when fetch fails and no snapshot', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.queryByText('Security Score')).toBeNull();
    });
  });

  it('shows "live" source badge', async () => {
    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('live')).toBeDefined();
    });
  });

  it('hides Fail2Ban section when not available', async () => {
    const snapshotWithoutFail2ban = {
      ...mockSnapshot,
      fail2ban: { ...mockSnapshot.fail2ban, available: false },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshotWithoutFail2ban,
    }) as unknown as typeof fetch;

    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.queryByText('Fail2Ban')).toBeNull();
    });
  });

  it('shows empty state in Fail2Ban when no jails', async () => {
    const snapshotNoJails = {
      ...mockSnapshot,
      fail2ban: { ...mockSnapshot.fail2ban, jails: [] },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshotNoJails,
    }) as unknown as typeof fetch;

    await act(async () => render(<SecurityPage />));
    await waitFor(() => {
      expect(screen.getByText('No jails configured')).toBeDefined();
    });
  });
});
