export const NODE_STATUSES = [
  'online',
  'offline',
  'connecting',
  'degraded',
  'maintenance',
  'disabled',
  'unpaired',
  'error',
] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const NODE_TRANSITIONS = [
  'rebooting', // bootAt within 2min, no heartbeat yet
  'starting_agent', // bootAt within 2min, heartbeat present, tunnelStatus not connected
  'reconnecting_tunnel', // tunnelStatus===reconnecting after recent reboot
  'restoring_proxies', // tunnel connected but proxies not all active after reboot
] as const;
export type NodeTransition = (typeof NODE_TRANSITIONS)[number];

export const TUNNEL_STATUSES = [
  'connected',
  'reconnecting',
  'disconnected',
  'auth_failed',
  'config_invalid',
  'proxy_conflict',
  'unsupported_config',
] as const;
export type TunnelStatus = (typeof TUNNEL_STATUSES)[number];

export const PROXY_STATUSES = [
  'active',
  'disabled',
  'failed',
  'port_conflict',
  'dns_missing',
  'upstream_unreachable',
] as const;
export type ProxyStatus = (typeof PROXY_STATUSES)[number];

export const PUBLIC_ROUTE_STATUSES = [
  'active',
  'disabled',
  'pending_dns',
  'cert_failed',
  'nginx_invalid',
  'nginx_reload_failed',
  'frp_unreachable',
  'upstream_down',
  'degraded',
] as const;
export type PublicRouteStatus = (typeof PUBLIC_ROUTE_STATUSES)[number];

export const SERVICE_STATES = [
  'running',
  'stopped',
  'starting',
  'stopping',
  'degraded',
  'failed',
] as const;
export type ServiceState = (typeof SERVICE_STATES)[number];

export const FRPC_PROTOCOLS = ['tcp', 'kcp', 'quic', 'websocket'] as const;
export type FrpcProtocol = (typeof FRPC_PROTOCOLS)[number];

export const ACCESS_MODES = [
  'public',
  'servermon_auth',
  'ip_allowlist',
  'basic_auth',
  'temporary_share',
  'disabled',
] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const SERVICE_MANAGERS = ['systemd', 'launchd', 'docker', 'manual', 'unknown'] as const;
export type ServiceManager = (typeof SERVICE_MANAGERS)[number];

export const FLEET_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'audit'] as const;
export type FleetLogLevel = (typeof FLEET_LOG_LEVELS)[number];

export const FLEET_LOG_SERVICES = [
  'servermon',
  'frps',
  'frpc',
  'nginx',
  'acme',
  'terminal',
  'endpoint-runner',
  'agent',
  'backup',
  'update',
] as const;
export type FleetLogService = (typeof FLEET_LOG_SERVICES)[number];

export function isTerminalNodeStatus(s: NodeStatus): boolean {
  return (
    s === 'online' || s === 'offline' || s === 'error' || s === 'disabled' || s === 'maintenance'
  );
}
