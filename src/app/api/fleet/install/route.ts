import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import Node from '@/models/Node';
import { verifyPairingToken } from '@/lib/fleet/pairing';
import { renderInstallSnippet } from '@/lib/fleet/install-script';
import type { InstallerKind } from '@/lib/fleet/install-script';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:install');

const VALID_KINDS: InstallerKind[] = ['linux', 'docker', 'macos'];

function contentTypeFor(kind: InstallerKind): string {
  if (kind === 'linux' || kind === 'macos') return 'text/x-shellscript';
  return 'text/plain';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token') || '';
    const kindRaw = searchParams.get('kind') || 'linux';
    const kind: InstallerKind = VALID_KINDS.includes(kindRaw as InstallerKind)
      ? (kindRaw as InstallerKind)
      : 'linux';

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const prefix = token.slice(0, 8);
    const candidates = await Node.find({
      pairingTokenPrefix: prefix,
      pairingTokenHash: { $exists: true, $ne: null },
    });

    let matchedNode: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (!candidate.pairingTokenHash) continue;
      const ok = await verifyPairingToken(token, candidate.pairingTokenHash);
      if (ok) {
        matchedNode = candidate;
        break;
      }
    }

    if (!matchedNode) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hubUrl = process.env.FLEET_HUB_PUBLIC_URL ?? req.headers.get('host') ?? 'localhost';

    const snippet = renderInstallSnippet({
      kind,
      hubUrl,
      token,
      nodeId: String(matchedNode._id),
    });

    return new NextResponse(snippet, {
      status: 200,
      headers: {
        'content-type': contentTypeFor(kind),
      },
    });
  } catch (error) {
    log.error('Failed to render install snippet', error);
    return NextResponse.json({ error: 'Failed to render install snippet' }, { status: 500 });
  }
}
