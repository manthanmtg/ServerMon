import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import DiagnosticRun from '@/models/DiagnosticRun';
import { runPostRebootReconcile, type ReconcileGap } from '@/lib/fleet/reconcile';
import { getSession } from '@/lib/session';
import type { DiagnosticStepResult, StepStatus } from '@/lib/fleet/diagnostics';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:nodes:reconcile');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

function severityToStatus(severity: ReconcileGap['severity']): StepStatus {
  if (severity === 'error') return 'fail';
  if (severity === 'warn') return 'unknown';
  return 'pass';
}

function gapToStep(gap: ReconcileGap): DiagnosticStepResult {
  return {
    step: gap.id,
    status: severityToStatus(gap.severity),
    evidence: gap.detail,
    likelyCause: gap.label,
    durationMs: 0,
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
    const report = runPostRebootReconcile({
      node: (node.toObject?.() ?? node) as never,
      now: startedAt,
    });
    const finishedAt = new Date();

    const steps = report.gaps.map(gapToStep);
    const failCount = steps.filter((s) => s.status === 'fail').length;
    const passCount = steps.filter((s) => s.status === 'pass').length;
    const summary =
      steps.length === 0 || failCount === 0 ? 'pass' : passCount === 0 ? 'fail' : 'partial';

    const run = await DiagnosticRun.create({
      kind: 'client',
      targetId: id,
      steps,
      summary,
      startedAt,
      finishedAt,
      initiatedBy: session.user.username,
    });

    const runObj = run.toObject ? run.toObject() : run;
    const diagnosticRunId =
      (runObj as { _id?: { toString(): string } })._id?.toString() ??
      (runObj as { _id?: unknown })._id;

    return NextResponse.json({ report, diagnosticRunId });
  } catch (error) {
    log.error('Failed to run reconcile', error);
    return NextResponse.json({ error: 'Failed to run reconcile' }, { status: 500 });
  }
}
