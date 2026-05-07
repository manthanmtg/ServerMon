export interface ResilientFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError'))
  );
}

export async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function resilientFetch(
  url: string | URL | Request,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const { timeout = 10000, retries = 0, retryDelay = 1000, signal, ...fetchOptions } = options;

  let lastError: unknown = null;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    if (signal?.aborted) {
      abortFromCaller();
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
      return response;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
      lastError = err;

      if (timedOut && isAbortError(err)) {
        lastError = new Error(`Request timed out after ${timeout}ms`);
      }

      if (i < retries) {
        if (signal?.aborted) {
          throw signal.reason || lastError;
        }

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve(undefined);
          }, retryDelay);

          const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
          };

          signal?.addEventListener('abort', onAbort, { once: true });
        });
        continue;
      }
    }
  }
  throw lastError;
}
