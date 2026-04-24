import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';

export const DIAGNOSTIC_IGNORED_PATH_PREFIXES = ['/api/socket', '/api/metrics/stream'];

export interface RequestDiagnosticsTracker {
  beginRequest(input: { method: string; path: string }): string;
  completeRequest(
    id: string,
    input: {
      statusCode?: number;
      outcome: 'completed' | 'aborted' | 'error';
    }
  ): { durationMs: number } | null;
  getSlowRequestThresholdMs(): number;
}

export interface RequestDiagnosticsLogger {
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

interface HandleRequestInput {
  req: IncomingMessage;
  res: ServerResponse;
  parsedUrl: UrlWithParsedQuery;
  handle: (
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ) => Promise<unknown> | unknown;
  diagnostics: RequestDiagnosticsTracker;
  log: RequestDiagnosticsLogger;
}

export function shouldInstrumentRequest(pathname?: string | null): boolean {
  return !(
    pathname && DIAGNOSTIC_IGNORED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export async function handleRequestWithDiagnostics({
  req,
  res,
  parsedUrl,
  handle,
  diagnostics,
  log,
}: HandleRequestInput): Promise<void> {
  const pathname = parsedUrl.pathname ?? req.url ?? '/';

  if (!shouldInstrumentRequest(pathname)) {
    await handle(req, res, parsedUrl);
    return;
  }

  const requestId = diagnostics.beginRequest({
    method: req.method || 'GET',
    path: pathname,
  });
  let settled = false;

  const finalize = (outcome: 'completed' | 'aborted' | 'error') => {
    if (settled) return;
    settled = true;
    const record = diagnostics.completeRequest(requestId, {
      statusCode: res.statusCode,
      outcome,
    });
    if (record && record.durationMs >= diagnostics.getSlowRequestThresholdMs()) {
      log.warn('Slow request detected', record);
    }
  };

  res.once('finish', () => finalize('completed'));
  res.once('close', () => {
    finalize(res.writableEnded ? 'completed' : 'aborted');
  });

  try {
    await handle(req, res, parsedUrl);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
    }
    finalize('error');
    log.error('Unhandled request failure', error);
    if (!res.headersSent) {
      res.end('Internal Server Error');
    }
  }
}
