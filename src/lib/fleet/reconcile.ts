export interface ReconcileInput {
  node: {
    lastSeen?: Date | string;
    tunnelStatus: string;
    lastBootAt?: Date | string;
    proxyRules?: Array<{ name: string; enabled: boolean; status: string; lastError?: string }>;
  };
  now?: Date;
}

export interface ReconcileGap {
  id: string; // e.g. 'heartbeat_stale' | 'tunnel_disconnected' | 'proxy_not_active:<name>'
  label: string;
  severity: 'error' | 'warn' | 'info';
  detail?: string;
}

export interface ReconcileReport {
  healthy: boolean;
  gaps: ReconcileGap[];
  checkedAt: string; // ISO
}

const HEARTBEAT_STALE_MS = 60_000;
const REBOOT_GRACE_MS = 120_000;

function toDate(v: Date | string | undefined): Date | undefined {
  if (!v) return undefined;
  return v instanceof Date ? v : new Date(v);
}

export function runPostRebootReconcile(input: ReconcileInput): ReconcileReport {
  const now = input.now ?? new Date();
  const lastSeen = toDate(input.node.lastSeen);
  const lastBootAt = toDate(input.node.lastBootAt);
  const gaps: ReconcileGap[] = [];

  if (!lastSeen || now.getTime() - lastSeen.getTime() > HEARTBEAT_STALE_MS) {
    gaps.push({
      id: 'heartbeat_stale',
      label: 'Heartbeat is stale or missing',
      severity: 'error',
      detail: lastSeen
        ? `Last heartbeat was at ${lastSeen.toISOString()}`
        : 'No heartbeat has ever been received',
    });
  }

  if (input.node.tunnelStatus !== 'connected') {
    const bootRecent = lastBootAt && now.getTime() - lastBootAt.getTime() <= REBOOT_GRACE_MS;
    gaps.push({
      id: 'tunnel_disconnected',
      label: 'Tunnel is not connected',
      severity: bootRecent ? 'warn' : 'error',
      detail: `tunnelStatus=${input.node.tunnelStatus}`,
    });
  }

  for (const p of input.node.proxyRules ?? []) {
    if (p.enabled && p.status !== 'active') {
      gaps.push({
        id: `proxy_not_active:${p.name}`,
        label: `Proxy "${p.name}" is not active`,
        severity: 'warn',
        detail: p.lastError ? `status=${p.status}; ${p.lastError}` : `status=${p.status}`,
      });
    }
  }

  const healthy = gaps.every((g) => g.severity === 'info');

  return {
    healthy,
    gaps,
    checkedAt: now.toISOString(),
  };
}
