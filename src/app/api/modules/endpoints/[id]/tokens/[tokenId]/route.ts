import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import { revokeToken } from '@/lib/endpoints/token-service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:tokens:revoke');

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
    try {
        await connectDB();
        const { id, tokenId } = await params;

        const success = await revokeToken(id, tokenId);
        if (!success) {
            return NextResponse.json({ error: 'Token not found' }, { status: 404 });
        }

        log.info(`Token ${tokenId} revoked for endpoint ${id}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        log.error('Failed to revoke token', error);
        return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 });
    }
}
