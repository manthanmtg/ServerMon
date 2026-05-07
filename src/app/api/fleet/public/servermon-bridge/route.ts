import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { listManagedDatabases } from '@/lib/databases/service';
import {
  buildServerMonBridgeSnapshot,
  resolveServerMonBridgeToken,
  serverMonBridgeTokenMatches,
} from '@/lib/fleet/servermonBridge';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:public:servermon-bridge');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parseHostHeader(host: string | null): string {
  if (!host) return '';
  if (host.startsWith('[')) {
    const closing = host.indexOf(']');
    return closing >= 0 ? host.slice(0, closing + 1) : host;
  }
  return host.split(':')[0] ?? '';
}

function isLoopbackRequest(request: NextRequest): boolean {
  const urlHost = request.nextUrl.hostname;
  const headerHost = parseHostHeader(request.headers.get('host'));
  return LOOPBACK_HOSTS.has(urlHost) && LOOPBACK_HOSTS.has(headerHost || urlHost);
}

async function bridgeTokenAllowed(request: NextRequest): Promise<boolean> {
  const expected = await resolveServerMonBridgeToken();
  if (!expected) return process.env.NODE_ENV !== 'production';
  return serverMonBridgeTokenMatches(
    request.headers.get('x-servermon-agent-bridge-token'),
    expected
  );
}

function currentPort(request: NextRequest): number {
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535) return envPort;
  const urlPort = Number(request.nextUrl.port);
  if (Number.isInteger(urlPort) && urlPort >= 1 && urlPort <= 65535) return urlPort;
  return 8912;
}

export async function GET(request: NextRequest) {
  try {
    if (!isLoopbackRequest(request) || !(await bridgeTokenAllowed(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const databases = await listManagedDatabases();
    const snapshot = buildServerMonBridgeSnapshot({
      app: {
        port: currentPort(request),
        ...(process.env.npm_package_version ? { version: process.env.npm_package_version } : {}),
      },
      databases,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    log.error('Failed to build ServerMon bridge capabilities', error);
    return NextResponse.json(
      { error: 'Failed to build ServerMon bridge capabilities' },
      { status: 500 }
    );
  }
}
