interface ResilientFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryOnStatuses?: number[];
}

const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
  const {
    timeout = 10000,
    retries = 0,
    retryDelay = 1000,
    retryOnStatuses = [],
    signal,
    ...fetchOptions
  } = options;
  const method = (
    fetchOptions.method ?? (url instanceof Request ? url.method : 'GET')
  ).toUpperCase();
  const canRetryStatus = SAFE_RETRY_METHODS.has(method);
  const retryCount = Number.isFinite(retries) ? Math.max(0, Math.floor(retries)) : 0;

  let lastError: unknown = null;
  for (let i = 0; i <= retryCount; i++) {
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

      if (
        i < retryCount &&
        canRetryStatus &&
        retryOnStatuses.includes(response.status) &&
        !signal?.aborted
      ) {
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

      return response;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
      lastError = err;

      if (timedOut && isAbortError(err)) {
        lastError = new Error(`Request timed out after ${timeout}ms`);
      }

      if (i < retryCount && canRetryStatus) {
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

      throw lastError;
    }
  }
  throw lastError;
}
