/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type { ListeningPort, FirewallRule, PortCheckResult, PortsSnapshot } from './types';

describe('ports type shapes', () => {
  it('ListeningPort captures protocol, port, and process info', () => {
    const port: ListeningPort = {
      protocol: 'tcp',
      port: 80,
      address: '0.0.0.0',
      pid: 1234,
      process: 'nginx',
      user: 'www-data',
      state: 'LISTEN',
      family: 'IPv4',
    };
    expect(port.protocol).toBe('tcp');
    expect(port.port).toBe(80);
    expect(port.family).toBe('IPv4');
  });

  it('ListeningPort protocol covers all variants', () => {
    const protocols: ListeningPort['protocol'][] = ['tcp', 'udp', 'tcp6', 'udp6'];
    expect(protocols).toHaveLength(4);
  });

  it('ListeningPort pid can be null for kernel sockets', () => {
    const port: ListeningPort = {
      protocol: 'tcp',
      port: 22,
      address: '::',
      pid: null,
      process: 'kernel',
      user: 'root',
      state: 'LISTEN',
      family: 'IPv6',
    };
    expect(port.pid).toBeNull();
    expect(port.family).toBe('IPv6');
  });

  it('FirewallRule captures chain, action, and ports', () => {
    const rule: FirewallRule = {
      chain: 'INPUT',
      action: 'ACCEPT',
      protocol: 'tcp',
      port: '22',
      source: '0.0.0.0/0',
      destination: '0.0.0.0/0',
      raw: '-A INPUT -p tcp --dport 22 -j ACCEPT',
    };
    expect(rule.chain).toBe('INPUT');
    expect(rule.action).toBe('ACCEPT');
    expect(rule.port).toBe('22');
  });

  it('PortCheckResult reports port availability', () => {
    const available: PortCheckResult = { port: 3000, available: true };
    const inUse: PortCheckResult = {
      port: 80,
      available: false,
      process: 'nginx',
      pid: 1234,
    };
    expect(available.available).toBe(true);
    expect(available.process).toBeUndefined();
    expect(inUse.available).toBe(false);
    expect(inUse.pid).toBe(1234);
  });

  it('PortsSnapshot wraps listening ports, summary, and firewall', () => {
    const snapshot: PortsSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      source: 'live',
      listening: [
        {
          protocol: 'tcp',
          port: 22,
          address: '0.0.0.0',
          pid: 555,
          process: 'sshd',
          user: 'root',
          state: 'LISTEN',
          family: 'IPv4',
        },
      ],
      summary: {
        totalListening: 1,
        tcpCount: 1,
        udpCount: 0,
        uniqueProcesses: 1,
      },
      firewall: {
        available: true,
        backend: 'ufw',
        enabled: true,
        rules: [],
      },
    };
    expect(snapshot.source).toBe('live');
    expect(snapshot.listening).toHaveLength(1);
    expect(snapshot.summary.tcpCount).toBe(1);
    expect(snapshot.firewall.backend).toBe('ufw');
  });

  it('PortsSnapshot firewall backend covers all options', () => {
    const backends: PortsSnapshot['firewall']['backend'][] = [
      'ufw',
      'iptables',
      'firewalld',
      'none',
    ];
    expect(backends).toHaveLength(4);
  });
});
