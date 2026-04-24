import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import DiagnosticRun from '@/models/DiagnosticRun';
import { runChain, CLIENT_DIAG_CHAIN, type ClientDiagCtx } from '@/lib/fleet/diagnostics';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:diagnose');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

/**
 * Phase 1 diagnostic context.
 *
 * The runChain framework is real and exercised here, but individual probes
 * are not yet implemented (they rely on hub reachability checks, frpc status
 * introspection, and service-manager inspection which ship in a later phase).
 * Each probe returns { ok: false, detail: 'pending-phase-2' } so the generated
 * DiagnosticRun document reflects real output with a clearly labeled
 * "not-yet-implemented" state instead of a misleading pass.
 */
function buildPhase1ClientDiagCtx(): ClientDiagCtx {
  const pending = async () => ({
    ok: false,
    detail: 'pending-phase-2',
  });
  return {
    checkHubReachability: pending,
    verifyTokenAuth: pending,
    checkFrpsConnection: pending,
    validateFrpcConfig: pending,
    checkHeartbeatFresh: pending,
    checkServiceManager: pending,
    checkLocalCapabilities: pending,
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

    const node = await Node.findById(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const startedAt = new Date();
    const ctx = buildPhase1ClientDiagCtx();
    const steps = await runChain(CLIENT_DIAG_CHAIN, ctx, { stopOnFail: false });
    const finishedAt = new Date();

    const passCount = steps.filter((s) => s.status === 'pass').length;
    const failCount = steps.filter((s) => s.status === 'fail').length;
    const summary = failCount === 0 ? 'pass' : passCount === 0 ? 'fail' : 'partial';

    const run = await DiagnosticRun.create({
      kind: 'client',
      targetId: id,
      steps,
      summary,
      startedAt,
      finishedAt,
      initiatedBy: session.user.username,
    });

    return NextResponse.json(run.toObject());
  } catch (error) {
    log.error('Failed to run diagnostics', error);
    return NextResponse.json({ error: 'Failed to run diagnostics' }, { status: 500 });
  }
}
