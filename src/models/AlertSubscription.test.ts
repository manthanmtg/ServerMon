import { describe, it, expect } from 'vitest';
import { AlertSubscriptionZodSchema } from './AlertSubscription';

describe('AlertSubscriptionZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = AlertSubscriptionZodSchema.parse({
      name: 'All reboots',
      channelId: 'ch1',
      eventKinds: ['node.reboot'],
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.minSeverity).toBe('warn');
    expect(parsed.eventKinds).toEqual(['node.reboot']);
  });

  it('accepts wildcard event kind', () => {
    const parsed = AlertSubscriptionZodSchema.parse({
      name: 'All',
      channelId: 'ch1',
      eventKinds: ['*'],
    });
    expect(parsed.eventKinds).toEqual(['*']);
  });

  it('accepts filters', () => {
    const parsed = AlertSubscriptionZodSchema.parse({
      name: 'Filtered',
      channelId: 'ch1',
      eventKinds: ['node.reboot'],
      filters: {
        nodeIds: ['n1'],
        tags: ['prod'],
        eventTypes: ['^frp\\..*$'],
      },
    });
    expect(parsed.filters?.nodeIds).toEqual(['n1']);
    expect(parsed.filters?.tags).toEqual(['prod']);
    expect(parsed.filters?.eventTypes).toEqual(['^frp\\..*$']);
  });

  it('accepts throttle config', () => {
    const parsed = AlertSubscriptionZodSchema.parse({
      name: 'Throttled',
      channelId: 'ch1',
      eventKinds: ['node.reboot'],
      throttle: { windowSec: 60, maxPerWindow: 5 },
    });
    expect(parsed.throttle).toEqual({ windowSec: 60, maxPerWindow: 5 });
  });

  it('rejects missing channelId', () => {
    expect(() => AlertSubscriptionZodSchema.parse({ name: 'x', eventKinds: [] })).toThrow();
  });

  it('rejects empty channelId', () => {
    expect(() =>
      AlertSubscriptionZodSchema.parse({ name: 'x', channelId: '', eventKinds: [] })
    ).toThrow();
  });

  it('rejects invalid minSeverity', () => {
    expect(() =>
      AlertSubscriptionZodSchema.parse({
        name: 'x',
        channelId: 'ch1',
        eventKinds: [],
        minSeverity: 'critical',
      })
    ).toThrow();
  });

  it('rejects throttle windowSec of 0', () => {
    expect(() =>
      AlertSubscriptionZodSchema.parse({
        name: 'x',
        channelId: 'ch1',
        eventKinds: [],
        throttle: { windowSec: 0, maxPerWindow: 5 },
      })
    ).toThrow();
  });

  it('rejects name longer than 120 chars', () => {
    expect(() =>
      AlertSubscriptionZodSchema.parse({
        name: 'x'.repeat(121),
        channelId: 'ch1',
        eventKinds: [],
      })
    ).toThrow();
  });
});
