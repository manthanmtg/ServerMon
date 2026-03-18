/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  NetworkInterface,
  NetworkStats,
  NetworkConnection,
  NetworkAlertSummary,
  NetworkSnapshot,
} from './types';

describe('network type shapes', () => {
  it('NetworkInterface captures interface properties', () => {
    const iface: NetworkInterface = {
      iface: 'eth0',
      ip4: '192.168.1.10',
      ip6: 'fe80::1',
      mac: 'aa:bb:cc:dd:ee:ff',
      internal: false,
      virtual: false,
      operstate: 'up',
      type: 'wired',
      duplex: 'full',
      mtu: 1500,
      speed: 1000,
      carrierChanges: 2,
    };
    expect(iface.iface).toBe('eth0');
    expect(iface.internal).toBe(false);
    expect(iface.mtu).toBe(1500);
    expect(iface.speed).toBe(1000);
  });

  it('NetworkInterface can represent loopback', () => {
    const lo: NetworkInterface = {
      iface: 'lo',
      ip4: '127.0.0.1',
      ip6: '::1',
      mac: '00:00:00:00:00:00',
      internal: true,
      virtual: false,
      operstate: 'unknown',
      type: 'loopback',
      duplex: '',
      mtu: 65536,
      speed: 0,
      carrierChanges: 0,
    };
    expect(lo.internal).toBe(true);
    expect(lo.iface).toBe('lo');
  });

  it('NetworkStats tracks rx and tx bytes and rates', () => {
    const stats: NetworkStats = {
      iface: 'eth0',
      rx_bytes: 1048576,
      tx_bytes: 524288,
      rx_packets: 1000,
      tx_packets: 800,
      rx_errors: 0,
      tx_errors: 0,
      rx_dropped: 0,
      tx_dropped: 0,
      rx_sec: 10240,
      tx_sec: 5120,
      ms: 1000,
    };
    expect(stats.iface).toBe('eth0');
    expect(stats.rx_bytes).toBeGreaterThan(stats.tx_bytes);
    expect(stats.rx_errors).toBe(0);
  });

  it('NetworkConnection captures connection endpoints', () => {
    const conn: NetworkConnection = {
      protocol: 'tcp',
      localAddress: '0.0.0.0',
      localPort: '80',
      peerAddress: '1.2.3.4',
      peerPort: '55123',
      state: 'ESTABLISHED',
      process: 'nginx',
      pid: 1234,
    };
    expect(conn.protocol).toBe('tcp');
    expect(conn.state).toBe('ESTABLISHED');
    expect(conn.pid).toBe(1234);
  });

  it('NetworkConnection pid is optional', () => {
    const conn: NetworkConnection = {
      protocol: 'udp',
      localAddress: '0.0.0.0',
      localPort: '53',
      peerAddress: '*',
      peerPort: '*',
      state: '',
      process: 'systemd-resolved',
    };
    expect(conn.pid).toBeUndefined();
  });

  it('NetworkAlertSummary severity is warning or critical', () => {
    const warning: NetworkAlertSummary = {
      id: 'net-1',
      severity: 'warning',
      title: 'High packet loss',
      message: 'eth0 has 5% packet loss',
      source: 'eth0',
      active: true,
      firstSeenAt: '2026-03-18T00:00:00Z',
      lastSeenAt: '2026-03-18T01:00:00Z',
    };
    expect(warning.severity).toBe('warning');
    expect(warning.active).toBe(true);
  });

  it('NetworkSnapshot wraps interfaces, stats, connections, alerts, and history', () => {
    const snapshot: NetworkSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      interfaces: [],
      stats: [],
      connections: [],
      alerts: [],
      history: [],
    };
    expect(snapshot.interfaces).toHaveLength(0);
    expect(snapshot.history).toHaveLength(0);
  });

  it('NetworkSnapshot history entries contain per-interface stats', () => {
    const snapshot: NetworkSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      interfaces: [],
      stats: [],
      connections: [],
      alerts: [],
      history: [
        {
          timestamp: '2026-03-18T00:00:00Z',
          stats: [{ iface: 'eth0', rx_sec: 1024, tx_sec: 512 }],
        },
      ],
    };
    expect(snapshot.history[0].stats[0].iface).toBe('eth0');
    expect(snapshot.history[0].stats[0].rx_sec).toBe(1024);
  });
});
