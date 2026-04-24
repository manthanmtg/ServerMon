import { NextResponse } from 'next/server';
import { AGENT_INSTALLER_BASH } from '@/lib/fleet/install-script';

export const dynamic = 'force-dynamic';

/**
 * Public endpoint to serve the agent installation script.
 * This must be unauthenticated so that new machines can download the script
 * before they are paired. The script itself requires a token to actually
 * perform any sensitive actions.
 */
export async function GET() {
  return new NextResponse(AGENT_INSTALLER_BASH, {
    status: 200,
    headers: {
      'Content-Type': 'text/x-shellscript',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
