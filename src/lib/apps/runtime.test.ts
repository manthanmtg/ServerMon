/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { parseJournalJsonLogs, parseSystemdRuntimeSnapshot, toAppLogServiceEntry } from './runtime';

describe('apps runtime helpers', () => {
  it('parses systemd service resource fields into an app runtime snapshot', () => {
    const snapshot = parseSystemdRuntimeSnapshot(
      'servermon-app-lifeos.service',
      [
        'Id=servermon-app-lifeos.service',
        'ActiveState=active',
        'SubState=running',
        'MainPID=4242',
        'MemoryCurrent=134217728',
        'CPUUsageNSec=25000000000',
        'NRestarts=2',
        'ActiveEnterTimestamp=Wed 2026-05-06 12:00:00 UTC',
      ].join('\n'),
      {
        totalMemoryBytes: 10737418240,
        nowMs: new Date('2026-05-06T12:02:00.000Z').getTime(),
        checkedAt: '2026-05-06T12:02:01.000Z',
      }
    );

    expect(snapshot).toMatchObject({
      available: true,
      serviceName: 'servermon-app-lifeos.service',
      activeState: 'active',
      subState: 'running',
      mainPid: 4242,
      memoryBytes: 134217728,
      memoryPercent: 1.25,
      restartCount: 2,
      checkedAt: '2026-05-06T12:02:01.000Z',
    });
    expect(snapshot.uptimeSeconds).toBe(120);
    expect(snapshot.cpuPercent).toBeGreaterThan(0);
  });

  it('parses journalctl JSON logs and skips malformed rows', () => {
    const logs = parseJournalJsonLogs(
      [
        JSON.stringify({
          __REALTIME_TIMESTAMP: '1778068800000000',
          PRIORITY: '3',
          MESSAGE: 'App failed to boot',
          _PID: '4242',
        }),
        'not-json',
      ].join('\n'),
      'servermon-app-lifeos.service'
    );

    expect(logs).toEqual([
      {
        timestamp: '2026-05-06T12:00:00.000Z',
        priority: 'err',
        message: 'App failed to boot',
        unit: 'servermon-app-lifeos.service',
        pid: 4242,
      },
    ]);
  });

  it('creates an unavailable runtime snapshot with a useful error', () => {
    expect(toAppLogServiceEntry('lifeos').serviceName).toBe('servermon-app-lifeos.service');
  });
});
