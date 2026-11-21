import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PortAvailabilityChecker } from './PortAvailabilityChecker';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function portCheckResponse(port: number, available: boolean): Response {
  return {
    ok: true,
    json: async () => ({ port, available }),
  } as Response;
}

describe('PortAvailabilityChecker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps the result for the latest port when an older check finishes later', async () => {
    vi.useFakeTimers();
    const staleResponse = deferred<Response>();
    const freshResponse = deferred<Response>();
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => staleResponse.promise)
      .mockImplementationOnce(() => freshResponse.promise);

    render(<PortAvailabilityChecker />);
    const input = screen.getByRole('spinbutton', { name: 'Port number' });

    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    fireEvent.change(input, { target: { value: '8080' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await act(async () => {
      freshResponse.resolve(portCheckResponse(8080, true));
    });
    expect(screen.getByText('Port 8080 is available')).toBeInTheDocument();

    await act(async () => {
      staleResponse.resolve(portCheckResponse(80, false));
    });
    expect(screen.getByText('Port 8080 is available')).toBeInTheDocument();
    expect(screen.queryByText('Port 80 is in use')).not.toBeInTheDocument();
  });

  it('does not repeat a manual check when the automatic check delay expires', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue(portCheckResponse(8080, true));

    render(<PortAvailabilityChecker />);
    const input = screen.getByRole('spinbutton', { name: 'Port number' });

    fireEvent.change(input, { target: { value: '8080' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
