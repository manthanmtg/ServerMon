export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info' | 'skip';

export interface SecurityCheck {
    id: string;
    category: string;
    title: string;
    description: string;
    status: CheckStatus;
    details: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface FirewallStatus {
    available: boolean;
    backend: 'ufw' | 'iptables' | 'firewalld' | 'none';
    enabled: boolean;
    defaultIncoming: string;
    defaultOutgoing: string;
    rulesCount: number;
}

export interface Fail2BanJail {
    name: string;
    enabled: boolean;
    currentlyBanned: number;
    totalBanned: number;
    bannedIps: string[];
}

export interface Fail2BanStatus {
    available: boolean;
    running: boolean;
    jails: Fail2BanJail[];
    totalBanned: number;
}

export interface SshConfig {
    permitRootLogin: string;
    passwordAuthentication: string;
    port: string;
    maxAuthTries: string;
    pubkeyAuthentication: string;
    x11Forwarding: string;
    allowedUsers: string[];
    allowedGroups: string[];
}

export interface LoginEntry {
    user: string;
    ip: string;
    timestamp: string;
    success: boolean;
    method: string;
}

export interface SystemUser {
    username: string;
    uid: number;
    gid: number;
    home: string;
    shell: string;
    hasPassword: boolean;
    isSystem: boolean;
    canLogin: boolean;
}

export interface PendingUpdate {
    package: string;
    currentVersion: string;
    newVersion: string;
    isSecurity: boolean;
}

export interface SecuritySnapshot {
    timestamp: string;
    source: 'live' | 'mock';
    score: number;
    checks: SecurityCheck[];
    firewall: FirewallStatus;
    fail2ban: Fail2BanStatus;
    ssh: SshConfig | null;
    recentLogins: LoginEntry[];
    users: SystemUser[];
    pendingUpdates: PendingUpdate[];
    summary: {
        totalChecks: number;
        passed: number;
        failed: number;
        warnings: number;
        criticalIssues: number;
        bannedIps: number;
        pendingSecurityUpdates: number;
    };
}
