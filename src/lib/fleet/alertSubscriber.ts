import type { FleetEvent, FleetEventKind } from './eventBus';
import {
  dispatchAlert,
  type AlertDispatchDeps,
  type AlertPayload,
  type AlertSeverity,
} from './alerts';

interface FleetEventBusLike {
  subscribe: (listener: (ev: FleetEvent) => void) => () => void;
}

export type AlertSubscriberDeps = AlertDispatchDeps & {
  fleetEventBus: FleetEventBusLike;
  onError?: (err: unknown) => void;
};

const SEVERITY_BY_KIND: Record<FleetEventKind, AlertSeverity> = {
  'node.heartbeat': 'info',
  'node.status_change': 'warn',
  'node.reboot': 'warn',
  'route.status_change': 'warn',
  'revision.applied': 'info',
  'frp.state_change': 'warn',
};

function humanizeStatus(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s;
}

function mapEventToPayload(ev: FleetEvent): AlertPayload | null {
  const kind = ev.kind;
  const severity = SEVERITY_BY_KIND[kind] ?? 'info';
  const baseMeta: Record<string, unknown> = { ...ev.data };
  switch (kind) {
    case 'node.reboot':
      return {
        title: `Node ${ev.nodeId ?? ''} rebooted`,
        message: `Node ${ev.nodeId ?? ''} issued a reboot.`,
        severity,
        eventKind: kind,
        nodeId: ev.nodeId,
        metadata: baseMeta,
        at: ev.at,
      };
    case 'node.status_change': {
      const status = humanizeStatus((ev.data as { status?: unknown })?.status);
      const severityForStatus: AlertSeverity =
        status === 'offline' || status === 'error'
          ? 'error'
          : status === 'degraded' || status === 'maintenance'
            ? 'warn'
            : 'info';
      return {
        title: `Node ${ev.nodeId ?? ''} status: ${status || 'changed'}`,
        message: `Node ${ev.nodeId ?? ''} status changed to ${status || 'unknown'}.`,
        severity: severityForStatus,
        eventKind: kind,
        nodeId: ev.nodeId,
        metadata: baseMeta,
        at: ev.at,
      };
    }
    case 'node.heartbeat':
      return {
        title: `Heartbeat from ${ev.nodeId ?? ''}`,
        message: `Heartbeat received from ${ev.nodeId ?? ''}.`,
        severity,
        eventKind: kind,
        nodeId: ev.nodeId,
        metadata: baseMeta,
        at: ev.at,
      };
    case 'route.status_change': {
      const status = humanizeStatus((ev.data as { status?: unknown })?.status);
      const severityForStatus: AlertSeverity =
        status === 'cert_failed' ||
        status === 'nginx_invalid' ||
        status === 'nginx_reload_failed' ||
        status === 'frp_unreachable' ||
        status === 'upstream_down'
          ? 'error'
          : 'warn';
      return {
        title: `Route ${ev.routeId ?? ''} status: ${status || 'changed'}`,
        message: `Route ${ev.routeId ?? ''} status changed to ${status || 'unknown'}.`,
        severity: severityForStatus,
        eventKind: kind,
        routeId: ev.routeId,
        metadata: baseMeta,
        at: ev.at,
      };
    }
    case 'revision.applied':
      return {
        title: 'Configuration revision applied',
        message: 'A configuration revision was applied to the fleet.',
        severity,
        eventKind: kind,
        metadata: baseMeta,
        at: ev.at,
      };
    case 'frp.state_change': {
      const runtimeState = humanizeStatus((ev.data as { runtimeState?: unknown })?.runtimeState);
      const severityForState: AlertSeverity =
        runtimeState === 'failed' || runtimeState === 'degraded' ? 'error' : 'warn';
      return {
        title: `FRP server: ${runtimeState || 'state changed'}`,
        message: `FRP runtime state: ${runtimeState || 'unknown'}.`,
        severity: severityForState,
        eventKind: kind,
        metadata: baseMeta,
        at: ev.at,
      };
    }
    default:
      return null;
  }
}

export function startAlertDispatch(deps: AlertSubscriberDeps): () => void {
  const { fleetEventBus, onError, ...dispatchDeps } = deps;
  const unsubscribe = fleetEventBus.subscribe((ev) => {
    const payload = mapEventToPayload(ev);
    if (!payload) return;
    Promise.resolve()
      .then(() => dispatchAlert(payload, dispatchDeps))
      .catch((err) => {
        if (onError) onError(err);
      });
  });
  return unsubscribe;
}

export { mapEventToPayload as __mapEventToPayloadForTests__ };
