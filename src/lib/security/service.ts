import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import type {
  SecurityCheck,
  FirewallStatus,
  Fail2BanStatus,
  Fail2BanJail,
  SshConfig,
  LoginEntry,
  SystemUser,
  PendingUpdate,
  SecuritySnapshot,
} from '@/modules/security/types';

const execFileAsync = promisify(execFile);
const log = createLogger('security');

async function execCmd(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch (err: unknown) {
    const error = err as { stdout?: string };
    if (error.stdout) return error.stdout;
    throw err;
  }
}

async function getFirewallStatus(): Promise<FirewallStatus> {
  const result: FirewallStatus = {
    available: false,
    backend: 'none',
    enabled: false,
    defaultIncoming: '',
    defaultOutgoing: '',
    rulesCount: 0,
  };

  if (process.platform !== 'linux') return result;

  try {
    const raw = await execCmd('ufw', ['status', 'verbose']);
    result.available = true;
    result.backend = 'ufw';
    result.enabled = raw.includes('Status: active');
    const incomingMatch = raw.match(/Default:\s*(\S+)\s*\(incoming\)/);
    const outgoingMatch = raw.match(/Default:\s*\S+\s*\(incoming\),\s*(\S+)\s*\(outgoing\)/);
    result.defaultIncoming = incomingMatch?.[1] || '';
    result.defaultOutgoing = outgoingMatch?.[1] || '';
    const ruleLines = raw.split('\n').filter((l) => l.match(/^\d+|ALLOW|DENY|REJECT|LIMIT/));
    result.rulesCount = ruleLines.length;
    return result;
  } catch {
    // try iptables
  }

  try {
    const raw = await execCmd('iptables', ['-L', '-n']);
    result.available = true;
    result.backend = 'iptables';
    result.enabled = true;
    const ruleLines = raw
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('Chain') && !l.startsWith('target'));
    result.rulesCount = ruleLines.length;
  } catch {
    // no firewall available
  }

  return result;
}

async function getFail2BanStatus(): Promise<Fail2BanStatus> {
  const result: Fail2BanStatus = {
    available: false,
    running: false,
    jails: [],
    totalBanned: 0,
  };

  if (process.platform !== 'linux') return result;

  try {
    const raw = await execCmd('fail2ban-client', ['status']);
    result.available = true;
    result.running = true;

    const jailListMatch = raw.match(/Jail list:\s*(.+)/);
    if (jailListMatch) {
      const jailNames = jailListMatch[1]
        .split(',')
        .map((j) => j.trim())
        .filter(Boolean);
      for (const name of jailNames) {
        try {
          const jailRaw = await execCmd('fail2ban-client', ['status', name]);
          const bannedMatch = jailRaw.match(/Currently banned:\s*(\d+)/);
          const totalMatch = jailRaw.match(/Total banned:\s*(\d+)/);
          const ipMatch = jailRaw.match(/Banned IP list:\s*(.*)/);

          const jail: Fail2BanJail = {
            name,
            enabled: true,
            currentlyBanned: bannedMatch ? parseInt(bannedMatch[1], 10) : 0,
            totalBanned: totalMatch ? parseInt(totalMatch[1], 10) : 0,
            bannedIps: ipMatch?.[1]?.trim().split(/\s+/).filter(Boolean) || [],
          };
          result.jails.push(jail);
          result.totalBanned += jail.currentlyBanned;
        } catch {
          // skip individual jail errors
        }
      }
    }
  } catch {
    // fail2ban not available
  }

  return result;
}

async function getSshConfig(): Promise<SshConfig | null> {
  try {
    const content = await readFile('/etc/ssh/sshd_config', 'utf-8');
    const getVal = (key: string): string => {
      const match = content.match(new RegExp(`^\\s*${key}\\s+(.+)`, 'mi'));
      return match?.[1]?.trim() || '';
    };

    const allowUsersMatch = content.match(/^\s*AllowUsers\s+(.+)/im);
    const allowGroupsMatch = content.match(/^\s*AllowGroups\s+(.+)/im);

    return {
      permitRootLogin: getVal('PermitRootLogin') || 'yes',
      passwordAuthentication: getVal('PasswordAuthentication') || 'yes',
      port: getVal('Port') || '22',
      maxAuthTries: getVal('MaxAuthTries') || '6',
      pubkeyAuthentication: getVal('PubkeyAuthentication') || 'yes',
      x11Forwarding: getVal('X11Forwarding') || 'no',
      allowedUsers: allowUsersMatch?.[1]?.split(/\s+/) || [],
      allowedGroups: allowGroupsMatch?.[1]?.split(/\s+/) || [],
    };
  } catch {
    return null;
  }
}

async function getRecentLogins(): Promise<LoginEntry[]> {
  const entries: LoginEntry[] = [];

  try {
    if (process.platform === 'linux') {
      const raw = await execCmd('last', ['-n', '20', '-i']);
      for (const line of raw.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (
          parts.length < 4 ||
          parts[0] === '' ||
          line.includes('wtmp begins') ||
          line.includes('reboot')
        )
          continue;
        entries.push({
          user: parts[0],
          ip: parts[2] || '',
          timestamp: parts.slice(3, 7).join(' '),
          success: true,
          method: 'login',
        });
      }

      // Failed logins
      try {
        const failRaw = await execCmd('lastb', ['-n', '10', '-i']);
        for (const line of failRaw.split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 4 || parts[0] === '' || line.includes('btmp begins')) continue;
          entries.push({
            user: parts[0],
            ip: parts[2] || '',
            timestamp: parts.slice(3, 7).join(' '),
            success: false,
            method: 'login',
          });
        }
      } catch {
        // lastb requires root
      }
    }
  } catch {
    // login history not available
  }

  return entries;
}

async function getSystemUsers(): Promise<SystemUser[]> {
  const users: SystemUser[] = [];

  try {
    const content = await readFile('/etc/passwd', 'utf-8');
    const noLoginShells = ['/usr/sbin/nologin', '/bin/false', '/sbin/nologin'];

    for (const line of content.split('\n')) {
      const parts = line.split(':');
      if (parts.length < 7) continue;
      const uid = parseInt(parts[2], 10);
      const shell = parts[6];

      users.push({
        username: parts[0],
        uid,
        gid: parseInt(parts[3], 10),
        home: parts[5],
        shell,
        hasPassword: true,
        isSystem: uid < 1000 && uid !== 0,
        canLogin: !noLoginShells.includes(shell),
      });
    }
  } catch {
    // /etc/passwd not readable
  }

  return users;
}

async function getPendingUpdates(): Promise<PendingUpdate[]> {
  const updates: PendingUpdate[] = [];

  if (process.platform !== 'linux') return updates;

  try {
    const raw = await execCmd('apt', ['list', '--upgradable'], 15000);
    for (const line of raw.split('\n')) {
      if (line.includes('Listing') || !line.includes('/')) continue;
      const nameMatch = line.match(/^(\S+)\//);
      const newVerMatch = line.match(/\s+(\S+)\s+\S+\s+\[/);
      const curVerMatch = line.match(/\[upgradable from: (\S+)\]/);
      if (nameMatch) {
        updates.push({
          package: nameMatch[1],
          currentVersion: curVerMatch?.[1] || '',
          newVersion: newVerMatch?.[1] || '',
          isSecurity: line.toLowerCase().includes('security'),
        });
      }
    }
  } catch {
    // apt not available
  }

  return updates;
}

function runSecurityChecks(
  firewall: FirewallStatus,
  fail2ban: Fail2BanStatus,
  ssh: SshConfig | null,
  users: SystemUser[],
  updates: PendingUpdate[]
): SecurityCheck[] {
  const checks: SecurityCheck[] = [];

  // Firewall check
  checks.push({
    id: 'firewall-enabled',
    category: 'Firewall',
    title: 'Firewall is enabled',
    description: 'A firewall should be active to filter incoming traffic.',
    status: firewall.enabled ? 'pass' : 'fail',
    details: firewall.available
      ? `${firewall.backend.toUpperCase()} is ${firewall.enabled ? 'active' : 'inactive'}`
      : 'No firewall detected',
    severity: 'critical',
  });

  // SSH checks
  if (ssh) {
    checks.push({
      id: 'ssh-root-login',
      category: 'SSH',
      title: 'Root login is disabled',
      description: 'SSH root login should be disabled.',
      status:
        ssh.permitRootLogin === 'no'
          ? 'pass'
          : ssh.permitRootLogin === 'prohibit-password'
            ? 'warn'
            : 'fail',
      details: `PermitRootLogin = ${ssh.permitRootLogin}`,
      severity: 'high',
    });

    checks.push({
      id: 'ssh-password-auth',
      category: 'SSH',
      title: 'Password authentication is disabled',
      description: 'SSH should use key-based authentication only.',
      status: ssh.passwordAuthentication === 'no' ? 'pass' : 'warn',
      details: `PasswordAuthentication = ${ssh.passwordAuthentication}`,
      severity: 'high',
    });

    checks.push({
      id: 'ssh-port',
      category: 'SSH',
      title: 'SSH port changed from default',
      description: 'Using a non-standard SSH port reduces automated attacks.',
      status: ssh.port !== '22' ? 'pass' : 'info',
      details: `SSH Port = ${ssh.port}`,
      severity: 'low',
    });

    checks.push({
      id: 'ssh-max-auth',
      category: 'SSH',
      title: 'Max auth tries is limited',
      description: 'MaxAuthTries should be 3 or fewer.',
      status: parseInt(ssh.maxAuthTries, 10) <= 3 ? 'pass' : 'warn',
      details: `MaxAuthTries = ${ssh.maxAuthTries}`,
      severity: 'medium',
    });
  } else {
    checks.push({
      id: 'ssh-config',
      category: 'SSH',
      title: 'SSH configuration readable',
      description: 'Could not read /etc/ssh/sshd_config.',
      status: 'skip',
      details: 'SSH config not accessible',
      severity: 'info',
    });
  }

  // Fail2Ban check
  checks.push({
    id: 'fail2ban-running',
    category: 'Intrusion Prevention',
    title: 'Fail2Ban is running',
    description: 'Fail2Ban protects against brute-force attacks.',
    status: fail2ban.running ? 'pass' : 'warn',
    details: fail2ban.available
      ? `Fail2Ban is ${fail2ban.running ? 'active' : 'inactive'} with ${fail2ban.jails.length} jails`
      : 'Fail2Ban not installed',
    severity: 'high',
  });

  // User checks
  const uid0Users = users.filter((u) => u.uid === 0 && u.username !== 'root');
  checks.push({
    id: 'no-extra-uid0',
    category: 'Users',
    title: 'No extra UID 0 accounts',
    description: 'Only root should have UID 0.',
    status: uid0Users.length === 0 ? 'pass' : 'fail',
    details:
      uid0Users.length === 0
        ? 'Only root has UID 0'
        : `Extra UID 0 accounts: ${uid0Users.map((u) => u.username).join(', ')}`,
    severity: 'critical',
  });

  const loginUsers = users.filter((u) => u.canLogin && !u.isSystem);
  checks.push({
    id: 'login-users',
    category: 'Users',
    title: 'Login-capable user accounts',
    description: 'Review accounts that can log in.',
    status: 'info',
    details: `${loginUsers.length} user(s) can log in: ${loginUsers.map((u) => u.username).join(', ')}`,
    severity: 'info',
  });

  // Updates check
  const securityUpdates = updates.filter((u) => u.isSecurity);
  checks.push({
    id: 'security-updates',
    category: 'Updates',
    title: 'Security updates installed',
    description: 'Pending security updates should be installed promptly.',
    status: securityUpdates.length === 0 ? 'pass' : securityUpdates.length > 5 ? 'fail' : 'warn',
    details:
      securityUpdates.length === 0
        ? 'No pending security updates'
        : `${securityUpdates.length} security update(s) pending`,
    severity: securityUpdates.length > 5 ? 'high' : 'medium',
  });

  checks.push({
    id: 'all-updates',
    category: 'Updates',
    title: 'System packages up to date',
    description: 'Keep all packages updated.',
    status: updates.length === 0 ? 'pass' : 'info',
    details: `${updates.length} package update(s) available`,
    severity: 'low',
  });

  return checks;
}

function computeScore(checks: SecurityCheck[]): number {
  const weights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 0 };
  let maxScore = 0;
  let deductions = 0;

  for (const check of checks) {
    const weight = weights[check.severity] || 0;
    maxScore += weight;
    if (check.status === 'fail') deductions += weight;
    else if (check.status === 'warn') deductions += weight * 0.5;
  }

  if (maxScore === 0) return 100;
  return Math.max(0, Math.round(((maxScore - deductions) / maxScore) * 100));
}

function getMockData(): SecuritySnapshot {
  const checks: SecurityCheck[] = [
    {
      id: 'firewall-enabled',
      category: 'Firewall',
      title: 'Firewall is enabled',
      description: '',
      status: 'pass',
      details: 'UFW is active',
      severity: 'critical',
    },
    {
      id: 'ssh-root-login',
      category: 'SSH',
      title: 'Root login is disabled',
      description: '',
      status: 'pass',
      details: 'PermitRootLogin = no',
      severity: 'high',
    },
    {
      id: 'ssh-password-auth',
      category: 'SSH',
      title: 'Password auth disabled',
      description: '',
      status: 'warn',
      details: 'PasswordAuthentication = yes',
      severity: 'high',
    },
    {
      id: 'ssh-port',
      category: 'SSH',
      title: 'SSH port changed',
      description: '',
      status: 'info',
      details: 'SSH Port = 22',
      severity: 'low',
    },
    {
      id: 'ssh-max-auth',
      category: 'SSH',
      title: 'Max auth tries limited',
      description: '',
      status: 'pass',
      details: 'MaxAuthTries = 3',
      severity: 'medium',
    },
    {
      id: 'fail2ban-running',
      category: 'Intrusion Prevention',
      title: 'Fail2Ban running',
      description: '',
      status: 'pass',
      details: 'Fail2Ban active with 2 jails',
      severity: 'high',
    },
    {
      id: 'no-extra-uid0',
      category: 'Users',
      title: 'No extra UID 0',
      description: '',
      status: 'pass',
      details: 'Only root has UID 0',
      severity: 'critical',
    },
    {
      id: 'login-users',
      category: 'Users',
      title: 'Login users',
      description: '',
      status: 'info',
      details: '3 users can log in: root, deploy, admin',
      severity: 'info',
    },
    {
      id: 'security-updates',
      category: 'Updates',
      title: 'Security updates',
      description: '',
      status: 'warn',
      details: '3 security updates pending',
      severity: 'medium',
    },
    {
      id: 'all-updates',
      category: 'Updates',
      title: 'Packages up to date',
      description: '',
      status: 'info',
      details: '12 package updates available',
      severity: 'low',
    },
  ];

  return {
    timestamp: new Date().toISOString(),
    source: 'mock',
    score: computeScore(checks),
    checks,
    firewall: {
      available: true,
      backend: 'ufw',
      enabled: true,
      defaultIncoming: 'deny',
      defaultOutgoing: 'allow',
      rulesCount: 8,
    },
    fail2ban: {
      available: true,
      running: true,
      totalBanned: 23,
      jails: [
        {
          name: 'sshd',
          enabled: true,
          currentlyBanned: 12,
          totalBanned: 156,
          bannedIps: ['192.168.1.100', '10.0.0.50'],
        },
        {
          name: 'nginx-http-auth',
          enabled: true,
          currentlyBanned: 11,
          totalBanned: 89,
          bannedIps: ['172.16.0.15'],
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
        ip: '192.168.1.10',
        timestamp: 'Mon Mar 10 14:23',
        success: true,
        method: 'ssh',
      },
      {
        user: 'deploy',
        ip: '10.0.0.5',
        timestamp: 'Mon Mar 10 12:01',
        success: true,
        method: 'ssh',
      },
      {
        user: 'root',
        ip: '203.0.113.42',
        timestamp: 'Sun Mar  9 23:45',
        success: false,
        method: 'ssh',
      },
    ],
    users: [
      {
        username: 'root',
        uid: 0,
        gid: 0,
        home: '/root',
        shell: '/bin/bash',
        hasPassword: true,
        isSystem: false,
        canLogin: true,
      },
      {
        username: 'deploy',
        uid: 1000,
        gid: 1000,
        home: '/home/deploy',
        shell: '/bin/bash',
        hasPassword: true,
        isSystem: false,
        canLogin: true,
      },
      {
        username: 'admin',
        uid: 1001,
        gid: 1001,
        home: '/home/admin',
        shell: '/bin/bash',
        hasPassword: true,
        isSystem: false,
        canLogin: true,
      },
    ],
    pendingUpdates: [
      {
        package: 'openssl',
        currentVersion: '3.0.2-0ubuntu1.14',
        newVersion: '3.0.2-0ubuntu1.15',
        isSecurity: true,
      },
      {
        package: 'libssl3',
        currentVersion: '3.0.2-0ubuntu1.14',
        newVersion: '3.0.2-0ubuntu1.15',
        isSecurity: true,
      },
      {
        package: 'curl',
        currentVersion: '7.81.0-1ubuntu1.15',
        newVersion: '7.81.0-1ubuntu1.16',
        isSecurity: true,
      },
    ],
    summary: {
      totalChecks: 10,
      passed: 5,
      failed: 0,
      warnings: 2,
      criticalIssues: 0,
      bannedIps: 23,
      pendingSecurityUpdates: 3,
    },
  };
}

async function getSnapshot(): Promise<SecuritySnapshot> {
  // On non-Linux systems, return mock data
  if (process.platform !== 'linux') {
    return getMockData();
  }

  try {
    const [firewall, fail2ban, ssh, recentLogins, users, pendingUpdates] = await Promise.all([
      getFirewallStatus(),
      getFail2BanStatus(),
      getSshConfig(),
      getRecentLogins(),
      getSystemUsers(),
      getPendingUpdates(),
    ]);

    const checks = runSecurityChecks(firewall, fail2ban, ssh, users, pendingUpdates);
    const score = computeScore(checks);

    const passed = checks.filter((c) => c.status === 'pass').length;
    const failed = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;
    const criticalIssues = checks.filter(
      (c) => c.status === 'fail' && (c.severity === 'critical' || c.severity === 'high')
    ).length;
    const securityUpdates = pendingUpdates.filter((u) => u.isSecurity).length;

    return {
      timestamp: new Date().toISOString(),
      source: 'live',
      score,
      checks,
      firewall,
      fail2ban,
      ssh,
      recentLogins,
      users: users.filter((u) => u.canLogin || u.uid === 0),
      pendingUpdates,
      summary: {
        totalChecks: checks.length,
        passed,
        failed,
        warnings,
        criticalIssues,
        bannedIps: fail2ban.totalBanned,
        pendingSecurityUpdates: securityUpdates,
      },
    };
  } catch (err) {
    log.error('Failed to get security snapshot', err);
    return getMockData();
  }
}

export const securityService = {
  getSnapshot,
};
