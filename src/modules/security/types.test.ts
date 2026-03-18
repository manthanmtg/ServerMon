/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  CheckStatus,
  SecurityCheck,
  FirewallStatus,
  Fail2BanJail,
  Fail2BanStatus,
  SshConfig,
  LoginEntry,
  SystemUser,
  PendingUpdate,
  SecuritySnapshot,
} from './types';

describe('security type shapes', () => {
  it('CheckStatus accepts all valid values', () => {
    const statuses: CheckStatus[] = ['pass', 'fail', 'warn', 'info', 'skip'];
    expect(statuses).toHaveLength(5);
  });

  it('SecurityCheck can be constructed', () => {
    const check: SecurityCheck = {
      id: 'firewall-enabled',
      category: 'Firewall',
      title: 'Firewall is enabled',
      description: 'Checks whether UFW or iptables is active',
      status: 'pass',
      details: 'UFW is active with 12 rules',
      severity: 'high',
    };
    expect(check.id).toBe('firewall-enabled');
    expect(check.status).toBe('pass');
    expect(check.severity).toBe('high');
  });

  it('SecurityCheck severity covers all levels', () => {
    const severities: SecurityCheck['severity'][] = [
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ];
    expect(severities).toHaveLength(5);
  });

  it('FirewallStatus captures backend and rule count', () => {
    const firewall: FirewallStatus = {
      available: true,
      backend: 'ufw',
      enabled: true,
      defaultIncoming: 'deny',
      defaultOutgoing: 'allow',
      rulesCount: 12,
    };
    expect(firewall.backend).toBe('ufw');
    expect(firewall.rulesCount).toBe(12);
  });

  it('FirewallStatus backend covers all options', () => {
    const backends: FirewallStatus['backend'][] = ['ufw', 'iptables', 'firewalld', 'none'];
    expect(backends).toHaveLength(4);
  });

  it('Fail2BanJail tracks ban counts', () => {
    const jail: Fail2BanJail = {
      name: 'sshd',
      enabled: true,
      currentlyBanned: 3,
      totalBanned: 47,
      bannedIps: ['192.168.1.100', '10.0.0.50', '172.16.0.1'],
    };
    expect(jail.name).toBe('sshd');
    expect(jail.bannedIps).toHaveLength(3);
  });

  it('Fail2BanStatus aggregates jails', () => {
    const status: Fail2BanStatus = {
      available: true,
      running: true,
      jails: [
        { name: 'sshd', enabled: true, currentlyBanned: 2, totalBanned: 10, bannedIps: [] },
      ],
      totalBanned: 2,
    };
    expect(status.jails).toHaveLength(1);
    expect(status.totalBanned).toBe(2);
  });

  it('SshConfig captures all config fields', () => {
    const ssh: SshConfig = {
      permitRootLogin: 'no',
      passwordAuthentication: 'no',
      port: '22',
      maxAuthTries: '3',
      pubkeyAuthentication: 'yes',
      x11Forwarding: 'no',
      allowedUsers: ['admin'],
      allowedGroups: [],
    };
    expect(ssh.permitRootLogin).toBe('no');
    expect(ssh.allowedUsers).toContain('admin');
  });

  it('LoginEntry tracks success and failure', () => {
    const entry: LoginEntry = {
      user: 'root',
      ip: '1.2.3.4',
      timestamp: '2026-03-18T00:00:00Z',
      success: false,
      method: 'password',
    };
    expect(entry.success).toBe(false);
    expect(entry.user).toBe('root');
  });

  it('SystemUser distinguishes system and login-capable users', () => {
    const user: SystemUser = {
      username: 'www-data',
      uid: 33,
      gid: 33,
      home: '/var/www',
      shell: '/usr/sbin/nologin',
      hasPassword: false,
      isSystem: true,
      canLogin: false,
    };
    expect(user.isSystem).toBe(true);
    expect(user.canLogin).toBe(false);
  });

  it('PendingUpdate tracks security flag', () => {
    const update: PendingUpdate = {
      package: 'openssl',
      currentVersion: '1.1.1t',
      newVersion: '1.1.1u',
      isSecurity: true,
    };
    expect(update.isSecurity).toBe(true);
  });

  it('SecuritySnapshot wraps all sub-reports', () => {
    const snapshot: SecuritySnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      source: 'live',
      score: 82,
      checks: [],
      firewall: {
        available: true,
        backend: 'ufw',
        enabled: true,
        defaultIncoming: 'deny',
        defaultOutgoing: 'allow',
        rulesCount: 5,
      },
      fail2ban: { available: false, running: false, jails: [], totalBanned: 0 },
      ssh: null,
      recentLogins: [],
      users: [],
      pendingUpdates: [],
      summary: {
        totalChecks: 10,
        passed: 8,
        failed: 1,
        warnings: 1,
        criticalIssues: 0,
        bannedIps: 0,
        pendingSecurityUpdates: 0,
      },
    };
    expect(snapshot.score).toBe(82);
    expect(snapshot.ssh).toBeNull();
    expect(snapshot.summary.passed).toBe(8);
  });
});
