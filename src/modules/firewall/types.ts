export type FirewallBackend = 'ufw' | 'iptables' | 'firewalld' | 'none';
export type FirewallSource = 'live' | 'mock';
export type FirewallRuleAction = 'allow' | 'deny' | 'reject' | 'limit' | 'unknown';
export type FirewallRuleDirection = 'in' | 'out' | 'any';
export type FirewallRuleProtocol = 'tcp' | 'udp' | 'any';
export type FirewallAddressFamily = 'ipv4' | 'ipv6' | 'any';
export type FirewallCheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface FirewallRule {
  id: string;
  to: string;
  action: FirewallRuleAction;
  direction: FirewallRuleDirection;
  from: string;
  protocol: FirewallRuleProtocol;
  port: string;
  addressFamily: FirewallAddressFamily;
  raw: string;
}

export interface FirewallCheck {
  id: string;
  title: string;
  status: FirewallCheckStatus;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details: string;
}

export interface FirewallSummary {
  rulesCount: number;
  allowCount: number;
  denyCount: number;
  rejectCount: number;
  limitCount: number;
  ipv6Rules: number;
  exposedWellKnownCount: number;
  healthScore: number;
}

export interface FirewallSnapshot {
  timestamp: string;
  source: FirewallSource;
  backend: FirewallBackend;
  available: boolean;
  enabled: boolean;
  defaultIncoming: string;
  defaultOutgoing: string;
  defaultRouted: string;
  rules: FirewallRule[];
  checks: FirewallCheck[];
  summary: FirewallSummary;
}
