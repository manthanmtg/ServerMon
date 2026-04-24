/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  PackageUpdate,
  UpdateHistoryEntry,
  UpdateAlertSummary,
  UpdateSnapshot,
} from './types';

describe('updates type shapes', () => {
  it('PackageUpdate captures version and severity info', () => {
    const update: PackageUpdate = {
      name: 'openssl',
      currentVersion: '1.1.1t',
      newVersion: '1.1.1u',
      severity: 'critical',
      repository: 'security',
      category: 'security',
      manager: 'apt',
    };
    expect(update.name).toBe('openssl');
    expect(update.severity).toBe('critical');
    expect(update.category).toBe('security');
  });

  it('PackageUpdate severity covers all levels', () => {
    const severities: PackageUpdate['severity'][] = ['low', 'medium', 'high', 'critical'];
    expect(severities).toHaveLength(4);
  });

  it('PackageUpdate category covers all types', () => {
    const categories: PackageUpdate['category'][] = ['security', 'regular', 'optional', 'language'];
    expect(categories).toHaveLength(4);
  });

  it('PackageUpdate manager covers all supported package managers', () => {
    const managers: PackageUpdate['manager'][] = ['apt', 'dnf', 'npm', 'pip', 'snap', 'flatpak'];
    expect(managers).toHaveLength(6);
  });

  it('PackageUpdate optional fields can be omitted', () => {
    const update: PackageUpdate = {
      name: 'vim',
      currentVersion: '9.0.0',
      newVersion: '9.0.1',
      severity: 'low',
      repository: 'main',
      category: 'regular',
      manager: 'apt',
    };
    expect(update.description).toBeUndefined();
    expect(update.changelog).toBeUndefined();
    expect(update.size).toBeUndefined();
  });

  it('UpdateHistoryEntry tracks package update results', () => {
    const entry: UpdateHistoryEntry = {
      id: 'upd-1',
      timestamp: '2026-03-18T00:00:00Z',
      packages: ['openssl', 'libssl'],
      count: 2,
      success: true,
    };
    expect(entry.success).toBe(true);
    expect(entry.packages).toHaveLength(2);
    expect(entry.count).toBe(2);
  });

  it('UpdateHistoryEntry can capture error info on failure', () => {
    const entry: UpdateHistoryEntry = {
      id: 'upd-2',
      timestamp: '2026-03-17T00:00:00Z',
      packages: ['curl'],
      count: 1,
      success: false,
      error: 'dpkg was interrupted',
      osVersion: 'Ubuntu 22.04',
    };
    expect(entry.success).toBe(false);
    expect(entry.error).toContain('dpkg');
    expect(entry.osVersion).toBe('Ubuntu 22.04');
  });

  it('UpdateAlertSummary severity is warning or critical', () => {
    const alert: UpdateAlertSummary = {
      id: 'alert-1',
      severity: 'warning',
      title: 'Security updates pending',
      message: '3 security packages need updating',
      source: 'apt',
      active: true,
      firstSeenAt: '2026-03-18T00:00:00Z',
      lastSeenAt: '2026-03-18T00:00:00Z',
    };
    expect(alert.severity).toBe('warning');
    expect(alert.active).toBe(true);
  });

  it('UpdateSnapshot wraps updates and history', () => {
    const snapshot: UpdateSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      osName: 'Ubuntu',
      osVersion: '22.04',
      packageManager: 'apt',
      updates: [],
      counts: {
        security: 3,
        regular: 12,
        optional: 5,
        language: 0,
      },
      pendingRestart: false,
      restartRequiredBy: [],
      lastCheck: '2026-03-18T00:00:00Z',
      history: [],
      alerts: [],
    };
    expect(snapshot.osName).toBe('Ubuntu');
    expect(snapshot.counts.security).toBe(3);
    expect(snapshot.pendingRestart).toBe(false);
  });

  it('UpdateSnapshot can include nextCheck and restartRequiredBy', () => {
    const snapshot: UpdateSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      osName: 'Debian',
      osVersion: '12',
      packageManager: 'apt',
      updates: [],
      counts: { security: 0, regular: 1, optional: 0, language: 0 },
      pendingRestart: true,
      restartRequiredBy: ['linux-image-6.1'],
      lastCheck: '2026-03-18T00:00:00Z',
      nextCheck: '2026-03-19T00:00:00Z',
      history: [],
      alerts: [],
    };
    expect(snapshot.pendingRestart).toBe(true);
    expect(snapshot.restartRequiredBy).toContain('linux-image-6.1');
    expect(snapshot.nextCheck).toBe('2026-03-19T00:00:00Z');
  });
});
