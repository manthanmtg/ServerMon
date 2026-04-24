import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import PublicRoute from '@/models/PublicRoute';
import DiagnosticRun from '@/models/DiagnosticRun';
import { runChain, ROUTE_DIAG_CHAIN, type RouteDiagCtx } from '@/lib/fleet/diagnostics';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:routes:diagnose');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

/**
 * Phase 1 route diagnostic context.
 *
 * Real probes (DNS, TLS, nginx config validation, frps/frpc reachability,
 * public URL checks) ship in a later phase. Each probe returns
 * { ok: false, detail: 'pending-phase-2' } so the persisted DiagnosticRun
 * reflects honest output rather than a misleading pass.
 */
function buildPhase1RouteDiagCtx(): RouteDiagCtx {
  const pending = async () => ({
    ok: false,
    detail: 'pending-phase-2',
  });
  return {
    checkDns: pending,
    checkTls: pending,
    checkNginxConfig: pending,
    checkNginxReloadState: pending,
    checkFrpsRoute: pending,
    checkFrpcTunnel: pending,
    checkRemoteLocalPort: pending,
    checkPublicUrl: pending,
  };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const route = await PublicRoute.findById(id);
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const startedAt = new Date();
    const ctx = buildPhase1RouteDiagCtx();
    const steps = await runChain(ROUTE_DIAG_CHAIN, ctx, { stopOnFail: false });
    const finishedAt = new Date();

    const passCount = steps.filter((s) => s.status === 'pass').length;
    const failCount = steps.filter((s) => s.status === 'fail').length;
    const summary = failCount === 0 ? 'pass' : passCount === 0 ? 'fail' : 'partial';

    const run = await DiagnosticRun.create({
      kind: 'route',
      targetId: id,
      steps,
      summary,
      startedAt,
      finishedAt,
      initiatedBy: session.user.username,
    });

    return NextResponse.json(run.toObject());
  } catch (error) {
    log.error('Failed to run route diagnostics', error);
    return NextResponse.json({ error: 'Failed to run route diagnostics' }, { status: 500 });
  }
}
