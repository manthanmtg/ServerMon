import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSharedPollingQuery, type SharedPollingOptions } from './useSharedPollingQuery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness<T>({ name, options }: { name: string; options: SharedPollingOptions<T> }) {
  const result = useSharedPollingQuery(options);
  return (
    <div>
      <span data-testid={`${name}-data`}>{JSON.stringify(result.data)}</span>
      <span data-testid={`${name}-error`}>{result.error?.message ?? ''}</span>
      <span data-testid={`${name}-loading`}>{String(result.loading)}</span>
      <button type="button" onClick={() => void result.refresh()}>
        Refresh {name}
      </button>
    </div>
  );
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('useSharedPollingQuery', () => {
  afterEach(() => {
    setVisibility('visible');
    setOnline(true);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deduplicates one request and snapshot across same-key consumers', async () => {
    const request = deferred<{ value: number }>();
    const fetcher = vi.fn(() => request.promise);
    const options = { key: 'dedupe', fetcher, intervalMs: 60_000 };

    const view = render(
      <>
        <Harness name="a" options={options} />
        <Harness name="b" options={options} />
      </>
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({ value: 7 }));
    expect(screen.getByTestId('a-data')).toHaveTextContent('{"value":7}');
    expect(screen.getByTestId('b-data')).toHaveTextContent('{"value":7}');
    view.unmount();
  });

  it('never overlaps interval or manual refresh requests', async () => {
    vi.useFakeTimers();
    const first = deferred<number>();
    const second = deferred<number>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const options = { key: 'no-overlap', fetcher, intervalMs: 100 };

    const view = render(<Harness name="one" options={options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh one' }));
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(1));
    await act(async () => vi.advanceTimersByTime(110));
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh one' }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve(2));
    view.unmount();
  });

  it('aborts an in-flight request when the final active subscriber leaves', () => {
    let capturedSignal: AbortSignal | undefined;
    const fetcher = vi.fn((signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<number>(() => {});
    });

    const view = render(
      <Harness name="abort" options={{ key: 'abort-final', fetcher, intervalMs: 1_000 }} />
    );
    expect(capturedSignal?.aborted).toBe(false);
    view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('pauses while hidden and refreshes stale data when visible again', async () => {
    vi.useFakeTimers();
    setVisibility('hidden');
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });
    const options = { key: 'visibility', fetcher, intervalMs: 100, staleTimeMs: 100 };

    const view = render(<Harness name="visible" options={options} />);
    expect(fetcher).not.toHaveBeenCalled();

    setVisibility('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetcher).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetcher).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('pauses offline and refreshes when connectivity returns', async () => {
    setOnline(false);
    const fetcher = vi.fn().mockResolvedValue('online');
    const view = render(
      <Harness name="network" options={{ key: 'network', fetcher, intervalMs: 1_000 }} />
    );
    expect(fetcher).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(fetcher).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('uses capped exponential backoff and resets it after success', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue(3);
    const options = {
      key: 'backoff',
      fetcher,
      intervalMs: 100,
      maxBackoffMs: 200,
    };

    const view = render(<Harness name="backoff" options={options} />);
    await act(async () => {});
    expect(screen.getByTestId('backoff-error')).toHaveTextContent('first');

    await act(async () => vi.advanceTimersByTime(110));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {});

    await act(async () => vi.advanceTimersByTime(210));
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => {});
    expect(screen.getByTestId('backoff-data')).toHaveTextContent('3');

    await act(async () => vi.advanceTimersByTime(110));
    expect(fetcher).toHaveBeenCalledTimes(4);
    view.unmount();
  });

  it('does not expose AbortError as an application failure', async () => {
    const fetcher = vi.fn((signal: AbortSignal) => {
      return new Promise<number>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const options = { key: 'abort-error', fetcher, intervalMs: 1_000 };

    const first = render(<Harness name="first" options={options} />);
    first.unmount();
    await act(async () => {});

    const second = render(<Harness name="second" options={{ ...options, enabled: false }} />);
    expect(screen.getByTestId('second-error')).toHaveTextContent('');
    second.unmount();
  });

  it('deduplicates simultaneous manual refreshes across subscribers', async () => {
    const initial = deferred<number>();
    const refresh = deferred<number>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(refresh.promise);
    const options = { key: 'manual', fetcher, intervalMs: 60_000 };
    const view = render(
      <>
        <Harness name="a" options={options} />
        <Harness name="b" options={options} />
      </>
    );
    await act(async () => initial.resolve(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh b' }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => refresh.resolve(2));
    expect(screen.getByTestId('a-data')).toHaveTextContent('2');
    expect(screen.getByTestId('b-data')).toHaveTextContent('2');
    view.unmount();
  });

  it('releases an idle cache entry after the retention window', async () => {
    vi.useFakeTimers();
    const firstFetcher = vi.fn().mockResolvedValue(1);
    const first = render(
      <Harness
        name="first"
        options={{ key: 'idle-cleanup', fetcher: firstFetcher, intervalMs: 60_000 }}
      />
    );
    await act(async () => {});
    first.unmount();

    await act(async () => vi.advanceTimersByTime(30_000));
    const secondFetcher = vi.fn().mockResolvedValue(2);
    const second = render(
      <Harness
        name="second"
        options={{ key: 'idle-cleanup', fetcher: secondFetcher, intervalMs: 60_000 }}
      />
    );
    await act(async () => {});
    expect(secondFetcher).toHaveBeenCalledOnce();
    second.unmount();
  });
});
