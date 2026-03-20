/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  ServiceState,
  ServiceSubState,
  ServiceType,
  ServiceUnit,
  ServiceLogEntry,
  ServiceAlertSummary,
  ServiceTimerInfo,
  ServiceResourceHistory,
  ServicesSnapshot,
} from './types';

describe('services type shapes', () => {
  it('ServiceState covers all systemd active states', () => {
    const states: ServiceState[] = [
      'active',
      'inactive',
      'failed',
      'activating',
      'deactivating',
      'reloading',
      'unknown',
    ];
    expect(states).toHaveLength(7);
  });

  it('ServiceSubState covers all systemd sub-states', () => {
    const subStates: ServiceSubState[] = [
      'running',
      'exited',
      'dead',
      'waiting',
      'start-pre',
      'start',
      'stop',
      'stop-post',
      'failed',
      'auto-restart',
      'listening',
      'mounted',
      'plugged',
      'unknown',
    ];
    expect(subStates).toHaveLength(14);
  });

  it('ServiceType covers all systemd service types', () => {
    const types: ServiceType[] = [
      'simple',
      'forking',
      'oneshot',
      'dbus',
      'notify',
      'idle',
      'unknown',
    ];
    expect(types).toHaveLength(7);
  });

  it('ServiceUnit can be constructed with required fields', () => {
    const service: ServiceUnit = {
      name: 'nginx.service',
      description: 'A high performance web server',
      loadState: 'loaded',
      activeState: 'active',
      subState: 'running',
      type: 'forking',
      mainPid: 1234,
      cpuPercent: 0.5,
      memoryBytes: 52428800,
      memoryPercent: 0.3,
      uptimeSeconds: 86400,
      restartCount: 0,
      enabled: true,
      unitFileState: 'enabled',
      fragmentPath: '/lib/systemd/system/nginx.service',
    };
    expect(service.name).toBe('nginx.service');
    expect(service.activeState).toBe('active');
    expect(service.subState).toBe('running');
    expect(service.enabled).toBe(true);
  });

  it('ServiceUnit optional dependency fields can be omitted', () => {
    const service: ServiceUnit = {
      name: 'myservice.service',
      description: 'Custom service',
      loadState: 'loaded',
      activeState: 'inactive',
      subState: 'dead',
      type: 'simple',
      mainPid: 0,
      cpuPercent: 0,
      memoryBytes: 0,
      memoryPercent: 0,
      uptimeSeconds: 0,
      restartCount: 0,
      enabled: false,
      unitFileState: 'disabled',
      fragmentPath: '/etc/systemd/system/myservice.service',
    };
    expect(service.triggeredBy).toBeUndefined();
    expect(service.wants).toBeUndefined();
    expect(service.requires).toBeUndefined();
    expect(service.after).toBeUndefined();
  });

  it('ServiceLogEntry tracks journal entry data', () => {
    const log: ServiceLogEntry = {
      timestamp: '2026-03-18T00:00:00Z',
      priority: 'info',
      message: 'Started nginx service',
      unit: 'nginx.service',
    };
    expect(log.priority).toBe('info');
    expect(log.unit).toBe('nginx.service');
  });

  it('ServiceLogEntry priority covers all syslog levels', () => {
    const priorities: ServiceLogEntry['priority'][] = [
      'emerg',
      'alert',
      'crit',
      'err',
      'warning',
      'notice',
      'info',
      'debug',
    ];
    expect(priorities).toHaveLength(8);
  });

  it('ServiceAlertSummary captures alert details', () => {
    const alert: ServiceAlertSummary = {
      id: 'svc-alert-1',
      severity: 'critical',
      title: 'Service crashed',
      message: 'nginx.service entered failed state',
      service: 'nginx.service',
      active: true,
      firstSeenAt: '2026-03-18T00:00:00Z',
      lastSeenAt: '2026-03-18T00:05:00Z',
    };
    expect(alert.severity).toBe('critical');
    expect(alert.active).toBe(true);
  });

  it('ServiceTimerInfo captures scheduling info', () => {
    const timer: ServiceTimerInfo = {
      name: 'apt-daily.timer',
      nextRun: '2026-03-19T06:00:00Z',
      lastRun: '2026-03-18T06:00:00Z',
      activates: 'apt-daily.service',
      persistent: true,
    };
    expect(timer.persistent).toBe(true);
    expect(timer.activates).toBe('apt-daily.service');
  });

  it('ServiceResourceHistory tracks per-service resource usage over time', () => {
    const history: ServiceResourceHistory = {
      timestamp: '2026-03-18T00:00:00Z',
      services: [
        { name: 'nginx.service', cpuPercent: 0.5, memoryBytes: 52428800 },
        { name: 'mysql.service', cpuPercent: 2.1, memoryBytes: 209715200 },
      ],
    };
    expect(history.services).toHaveLength(2);
    expect(history.services[0].cpuPercent).toBe(0.5);
  });

  it('ServicesSnapshot wraps services, timers, alerts, and summary', () => {
    const snapshot: ServicesSnapshot = {
      source: 'systemd',
      systemdAvailable: true,
      summary: {
        total: 50,
        running: 30,
        exited: 10,
        failed: 2,
        inactive: 8,
        enabled: 35,
        disabled: 15,
        healthScore: 96,
      },
      services: [],
      timers: [],
      alerts: [],
      history: [],
      timestamp: '2026-03-18T00:00:00Z',
    };
    expect(snapshot.source).toBe('systemd');
    expect(snapshot.summary.failed).toBe(2);
    expect(snapshot.summary.healthScore).toBe(96);
  });
});
