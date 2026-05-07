/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import {
  buildDnsInstructions,
  buildNginxConfig,
  buildSystemdUnit,
  createReleaseId,
  maskEnvVars,
  sanitizeAppSlug,
  toSystemdServiceName,
} from './rendering';

describe('apps rendering helpers', () => {
  it('sanitizes app slugs for filesystem, systemd, and nginx use', () => {
    expect(sanitizeAppSlug('Life OS')).toBe('life-os');
    expect(sanitizeAppSlug('app.example.com')).toBe('app-example-com');
    expect(() => sanitizeAppSlug('../bad')).toThrow(
      'App slug must start and end with a letter or number'
    );
  });

  it('creates timestamped release ids that are safe as directory names', () => {
    vi.setSystemTime(new Date('2026-05-06T12:34:56.789Z'));

    expect(createReleaseId()).toBe('20260506-123456-789');

    vi.useRealTimers();
  });

  it('masks secret-looking env values without hiding public config', () => {
    expect(
      maskEnvVars({
        DATABASE_URL: 'postgres://localhost/db',
        NEXT_PUBLIC_APP_URL: 'https://app.example.com',
        OPENAI_API_KEY: 'sk-secret',
        PASSWORD: 'secret',
      })
    ).toEqual({
      DATABASE_URL: '***',
      NEXT_PUBLIC_APP_URL: 'https://app.example.com',
      OPENAI_API_KEY: '***',
      PASSWORD: '***',
    });
  });

  it('renders a systemd unit that runs from current and survives ServerMon restarts', () => {
    const rendered = buildSystemdUnit({
      appSlug: 'lifeos',
      appRoot: '/opt/servermon/apps/lifeos',
      command: 'pnpm start',
      runAsUser: 'servermon',
      port: 3010,
    });

    expect(rendered).toContain('Description=ServerMon managed app lifeos');
    expect(rendered).toContain('WorkingDirectory=/opt/servermon/apps/lifeos/current/source');
    expect(rendered).toContain('EnvironmentFile=/opt/servermon/apps/lifeos/current/env');
    expect(rendered).toContain('Environment=PORT=3010');
    expect(rendered).toContain("ExecStart=/bin/sh -lc 'pnpm start'");
    expect(rendered).toContain('Restart=always');
    expect(rendered).toContain('User=servermon');
  });

  it('renders nginx config with websocket headers for Next.js apps', () => {
    const rendered = buildNginxConfig({
      domain: 'app.example.com',
      port: 3010,
    });

    expect(rendered).toContain('server_name app.example.com;');
    expect(rendered).toContain('proxy_pass http://127.0.0.1:3010;');
    expect(rendered).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(rendered).toContain('proxy_cache_bypass $http_upgrade;');
  });

  it('builds DNS instructions from a detected public ip', () => {
    expect(buildDnsInstructions('app.example.com', '203.0.113.10')).toEqual({
      type: 'A',
      name: 'app',
      value: '203.0.113.10',
      summary: 'Create A record: app.example.com -> 203.0.113.10',
    });
  });

  it('uses a stable systemd service name prefix', () => {
    expect(toSystemdServiceName('lifeos')).toBe('servermon-app-lifeos.service');
  });
});
