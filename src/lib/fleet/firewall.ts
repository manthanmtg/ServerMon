import net from 'node:net';

export interface CheckInboundPortInput {
  host: string;
  port: number;
  timeoutMs?: number;
  prober?: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
}

const DEFAULT_TIMEOUT_MS = 2000;

function defaultProber(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function checkInboundPort(
  input: CheckInboundPortInput
): Promise<{ open: boolean; host: string; port: number; timeoutMs: number }> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prober = input.prober ?? defaultProber;
  let open = false;
  try {
    open = await prober(input.host, input.port, timeoutMs);
  } catch {
    open = false;
  }
  return {
    open,
    host: input.host,
    port: input.port,
    timeoutMs,
  };
}
