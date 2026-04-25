import type { NodeStatus, NodeTransition, TunnelStatus } from './enums';

export interface DeriveNodeStatusInput {
  lastSeen?: Date;
  tunnelStatus?: TunnelStatus;
  maintenanceEnabled?: boolean;
  disabled?: boolean;
  unpaired?: boolean;
  lastError?: { occurredAt: Date } | null;
  now: Date;
}

export function deriveNodeStatus(i: DeriveNodeStatusInput): NodeStatus {
  if (i.unpaired) return 'unpaired';
  if (i.disabled) return 'disabled';
  if (i.maintenanceEnabled) return 'maintenance';
  const nowTime = i.now?.getTime() ?? Date.now();
  const seen = i.lastSeen?.getTime ? nowTime - i.lastSeen.getTime() : Infinity;
  if (seen > 60_000) return 'offline';
  if (i.tunnelStatus === 'auth_failed' || i.tunnelStatus === 'config_invalid') return 'error';
  if (
    i.tunnelStatus === 'reconnecting' ||
    i.tunnelStatus === 'proxy_conflict' ||
    i.tunnelStatus === 'unsupported_config'
  )
    return 'degraded';
  if (i.tunnelStatus === 'disconnected') return 'connecting';
  const errFresh =
    i.lastError?.occurredAt?.getTime && nowTime - i.lastError.occurredAt.getTime() < 60_000;
  if (errFresh) return 'error';
  return 'online';
}

export function lastSeenLabel(lastSeen: Date | undefined, now: Date): string {
  if (!lastSeen || !lastSeen.getTime) return 'never';
  const s = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export interface DeriveNodeTransitionInput {
  lastBootAt?: Date;
  lastSeen?: Date;
  tunnelStatus?: TunnelStatus;
  proxyRules?: Array<{ enabled: boolean; status: string }>;
  now: Date;
}

const REBOOT_WINDOW_MS = 120_000;

export function deriveNodeTransition(i: DeriveNodeTransitionInput): NodeTransition | null {
  if (!i.lastBootAt) return null;
  const sinceBoot = i.now.getTime() - i.lastBootAt.getTime();
  if (sinceBoot < 0 || sinceBoot > REBOOT_WINDOW_MS) return null;

  const sawHeartbeatSinceBoot =
    i.lastSeen !== undefined && i.lastSeen.getTime() >= i.lastBootAt.getTime();

  if (!sawHeartbeatSinceBoot) return 'rebooting';

  if (i.tunnelStatus === 'reconnecting') return 'reconnecting_tunnel';
  if (i.tunnelStatus === 'disconnected') return 'starting_agent';

  if (i.tunnelStatus === 'connected') {
    const enabled = (i.proxyRules ?? []).filter((p) => p.enabled);
    if (enabled.some((p) => p.status !== 'active')) return 'restoring_proxies';
  }

  return null;
}
