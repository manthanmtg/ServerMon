import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import FrpServerState from '@/models/FrpServerState';
import NginxState from '@/models/NginxState';
import { runPreflight, type PreflightEnv } from '@/lib/fleet/preflight';
import { createDefaultExecutors } from '@/lib/fleet/preflightExecutors';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:server:preflight');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function POST() {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const frp = await FrpServerState.findOne({ key: 'global' }).lean();
    const nginx = await NginxState.findOne({ key: 'global' }).lean();

    const env: PreflightEnv = {
      frpBindPort: frp?.bindPort ?? 7000,
      vhostHttpPort: frp?.vhostHttpPort ?? 8080,
      vhostHttpsPort: frp?.vhostHttpsPort,
      publicHostname: frp?.subdomainHost,
      nginxManagedDir: nginx?.managedDir,
      nginxBinaryPath: nginx?.binaryPath,
    };

    const executors = createDefaultExecutors();
    const results = await runPreflight(env, executors);

    return NextResponse.json({ results });
  } catch (error) {
    log.error('Failed to run preflight', error);
    return NextResponse.json({ error: 'Failed to run preflight' }, { status: 500 });
  }
}
