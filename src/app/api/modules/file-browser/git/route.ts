import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import {
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitDiscardFile,
  gitDiscardAll,
  gitCheckout,
  gitFetch,
  gitCommit,
  gitPull,
  gitLog,
  gitDiff,
} from '@/modules/file-browser/lib/file-browser';

export const dynamic = 'force-dynamic';

const log = createLogger('api:file-browser:git');

const actionSchema = z.object({
  root: z.string().trim().min(1),
  action: z.enum([
    'stage',
    'unstage',
    'stage-all',
    'unstage-all',
    'discard',
    'discard-all',
    'checkout',
    'fetch',
    'commit',
    'pull',
    'log',
    'diff',
  ]),
  path: z.string().optional(),
  branch: z.string().optional(),
  message: z.string().optional(),
  hash: z.string().optional(),
  limit: z.number().optional(),
  since: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = actionSchema.parse(await request.json());
    const { root, action } = body;

    let result = '';

    switch (action) {
      case 'stage':
        if (!body.path) return NextResponse.json({ error: 'path required' }, { status: 400 });
        await gitStage(root, body.path);
        result = `Staged ${body.path}`;
        break;
      case 'unstage':
        if (!body.path) return NextResponse.json({ error: 'path required' }, { status: 400 });
        await gitUnstage(root, body.path);
        result = `Unstaged ${body.path}`;
        break;
      case 'stage-all':
        await gitStageAll(root);
        result = 'Staged all changes';
        break;
      case 'unstage-all':
        await gitUnstageAll(root);
        result = 'Unstaged all changes';
        break;
      case 'discard':
        if (!body.path) return NextResponse.json({ error: 'path required' }, { status: 400 });
        await gitDiscardFile(root, body.path);
        result = `Discarded changes in ${body.path}`;
        break;
      case 'discard-all':
        await gitDiscardAll(root);
        result = 'Discarded all changes';
        break;
      case 'checkout':
        if (!body.branch) return NextResponse.json({ error: 'branch required' }, { status: 400 });
        await gitCheckout(root, body.branch);
        result = `Switched to ${body.branch}`;
        break;
      case 'fetch':
        result = await gitFetch(root);
        break;
      case 'commit':
        if (!body.message) return NextResponse.json({ error: 'message required' }, { status: 400 });
        result = await gitCommit(root, body.message);
        break;
      case 'pull':
        result = await gitPull(root);
        break;
      case 'log':
        const logs = await gitLog(root, body.limit, body.since);
        return NextResponse.json({ success: true, result: logs });
      case 'diff':
        if (!body.hash) return NextResponse.json({ error: 'hash required' }, { status: 400 });
        result = await gitDiff(root, body.hash);
        break;
    }

    log.info(`Git ${action}`, { root, result: result.slice(0, 200) });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git operation failed';
    log.error('Git operation failed', {
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: message, details: error }, { status: 500 });
  }
}
