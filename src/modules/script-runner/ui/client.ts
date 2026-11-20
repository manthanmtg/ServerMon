export const runnerApi = '/api/modules/script-runner';

export async function runnerRequest<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await fetch(runnerApi + path, {
    ...options,
    cache: 'no-store',
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof result?.error === 'string' ? result.error : 'Script Runner is unavailable.';
    throw new Error(message);
  }
  return result as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export const statusLabels = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  stopped: 'Stopped',
  timed_out: 'Timed out',
  interrupted: 'Interrupted',
};

export function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
