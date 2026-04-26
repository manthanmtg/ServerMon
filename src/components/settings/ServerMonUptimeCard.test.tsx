import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServerMonUptimeCard, { formatServerMonUptime } from './ServerMonUptimeCard';

describe('formatServerMonUptime', () => {
  it.each([
    [5, '5s'],
    [185, '3m 5s'],
    [7385, '2h 3m 5s'],
    [97385, '1d 3h 3m 5s'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatServerMonUptime(seconds)).toBe(expected);
  });
});

describe('ServerMonUptimeCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T15:00:00.000Z'));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', uptime: 97385 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders fetched uptime and online status', async () => {
    render(<ServerMonUptimeCard />);
    await flushRuntimeLoad();

    expect(screen.getByText('ServerMon Uptime')).toBeDefined();
    expect(screen.getByText('1d 3h 3m 5s')).toBeDefined();
    expect(screen.getByText('Online')).toBeDefined();
    expect(screen.getByText('Resets when ServerMon restarts')).toBeDefined();
  });

  it('advances the ticker locally without another fetch', async () => {
    render(<ServerMonUptimeCard />);
    await flushRuntimeLoad();
    expect(screen.getByText('1d 3h 3m 5s')).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText('1d 3h 3m 10s')).toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('shows degraded when health status is not ok but uptime is valid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'degraded', uptime: 185 }),
    });

    render(<ServerMonUptimeCard />);
    await flushRuntimeLoad();

    expect(screen.getByText('3m 5s')).toBeDefined();
    expect(screen.getByText('Degraded')).toBeDefined();
  });

  it('shows unavailable when uptime cannot be loaded', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    render(<ServerMonUptimeCard />);
    await flushRuntimeLoad();

    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText('Uptime could not be loaded')).toBeDefined();
  });
});

async function flushRuntimeLoad() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
