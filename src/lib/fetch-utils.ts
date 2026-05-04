export interface ResilientFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException ||
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
  const { timeout = 10000, retries = 0, retryDelay = 1000, ...fetchOptions } = options;

  let lastError: any = null;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      
      if (isAbortError(err)) {
        lastError = new Error(`Request timed out after ${timeout}ms`);
      }

      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
    }
  }
  throw lastError;
}
