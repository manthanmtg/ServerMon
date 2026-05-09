import { describe, it, expect } from 'vitest';
import {
  NODE_STATUSES,
  NODE_TRANSITIONS,
  TUNNEL_STATUSES,
  PROXY_STATUSES,
  PUBLIC_ROUTE_STATUSES,
  SERVICE_STATES,
} from './enums';

describe('fleet enums', () => {
  it('includes every spec-defined status', () => {
    expect(NODE_STATUSES).toEqual([
      'online',
      'offline',
      'connecting',
      'degraded',
      'maintenance',
      'disabled',
      'unpaired',
      'error',
    ]);
    expect(TUNNEL_STATUSES).toEqual([
      'connected',
      'connecting',
      'reconnecting',
      'disconnected',
      'auth_failed',
      'config_invalid',
      'proxy_conflict',
      'unsupported_config',
    ]);
    expect(PROXY_STATUSES).toEqual([
      'active',
      'disabled',
      'failed',
      'port_conflict',
      'dns_missing',
      'upstream_unreachable',
    ]);
    expect(PUBLIC_ROUTE_STATUSES).toEqual([
      'active',
      'disabled',
      'pending_dns',
      'cert_failed',
      'nginx_invalid',
      'nginx_reload_failed',
      'frp_unreachable',
      'upstream_down',
      'degraded',
    ]);
    expect(SERVICE_STATES).toEqual([
      'running',
      'stopped',
      'starting',
      'stopping',
      'degraded',
      'failed',
    ]);
  });
  it('includes the transitional substates for post-reboot UI', () => {
    expect(NODE_TRANSITIONS).toEqual([
      'rebooting',
      'starting_agent',
      'reconnecting_tunnel',
      'restoring_proxies',
    ]);
  });
});
