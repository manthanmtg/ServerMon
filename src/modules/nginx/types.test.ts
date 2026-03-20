/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  NginxStatus,
  NginxConnection,
  NginxVirtualHost,
  NginxLogEntry,
  NginxConfigTest,
  NginxSnapshot,
} from './types';

describe('nginx type shapes', () => {
  it('NginxStatus can be constructed', () => {
    const status: NginxStatus = {
      running: true,
      pid: 1234,
      version: '1.24.0',
      configPath: '/etc/nginx/nginx.conf',
      uptime: '2 days',
      workerProcesses: 4,
    };
    expect(status.running).toBe(true);
    expect(status.pid).toBe(1234);
    expect(status.workerProcesses).toBe(4);
  });

  it('NginxStatus pid can be null when nginx is stopped', () => {
    const status: NginxStatus = {
      running: false,
      pid: null,
      version: '1.24.0',
      configPath: '/etc/nginx/nginx.conf',
      uptime: '',
      workerProcesses: 0,
    };
    expect(status.pid).toBeNull();
    expect(status.running).toBe(false);
  });

  it('NginxConnection tracks connection counts', () => {
    const conn: NginxConnection = {
      active: 100,
      reading: 5,
      writing: 20,
      waiting: 75,
      accepts: 5000,
      handled: 4999,
      requests: 15000,
    };
    expect(conn.active).toBe(100);
    expect(conn.requests).toBe(15000);
    expect(conn.reading + conn.writing + conn.waiting).toBe(conn.active);
  });

  it('NginxVirtualHost captures server block details', () => {
    const vhost: NginxVirtualHost = {
      name: 'example.com',
      filename: 'example.com.conf',
      enabled: true,
      serverNames: ['example.com', 'www.example.com'],
      listenPorts: ['80', '443 ssl'],
      root: '/var/www/html',
      sslEnabled: true,
      proxyPass: '',
      raw: 'server { ... }',
    };
    expect(vhost.enabled).toBe(true);
    expect(vhost.sslEnabled).toBe(true);
    expect(vhost.serverNames).toHaveLength(2);
  });

  it('NginxLogEntry captures log level', () => {
    const entry: NginxLogEntry = {
      timestamp: '2026-03-18T00:00:00Z',
      level: 'error',
      message: 'connect() failed',
    };
    expect(entry.level).toBe('error');
    expect(entry.message).toContain('failed');
  });

  it('NginxConfigTest tracks success/failure', () => {
    const passing: NginxConfigTest = { success: true, output: 'test is successful' };
    const failing: NginxConfigTest = {
      success: false,
      output: 'nginx: [emerg] syntax error',
    };
    expect(passing.success).toBe(true);
    expect(failing.success).toBe(false);
    expect(failing.output).toContain('emerg');
  });

  it('NginxSnapshot wraps status, connections, and virtual hosts', () => {
    const snapshot: NginxSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      source: 'live',
      available: true,
      status: {
        running: true,
        pid: 999,
        version: '1.24.0',
        configPath: '/etc/nginx/nginx.conf',
        uptime: '1 hour',
        workerProcesses: 2,
      },
      connections: null,
      virtualHosts: [],
      summary: {
        totalVhosts: 3,
        enabledVhosts: 3,
        sslVhosts: 2,
        totalRequests: 50000,
      },
    };
    expect(snapshot.available).toBe(true);
    expect(snapshot.connections).toBeNull();
    expect(snapshot.summary.sslVhosts).toBe(2);
  });

  it('NginxSnapshot source can be live or mock', () => {
    const sources: NginxSnapshot['source'][] = ['live', 'mock'];
    expect(sources).toContain('live');
    expect(sources).toContain('mock');
  });
});
