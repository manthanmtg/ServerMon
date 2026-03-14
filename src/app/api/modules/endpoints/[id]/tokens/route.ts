import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import { generateToken, listTokens } from '@/lib/endpoints/token-service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:tokens');

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;

        const tokens = await listTokens(id);
        return NextResponse.json({ tokens });
    } catch (error) {
        log.error('Failed to list tokens', error);
        return NextResponse.json({ error: 'Failed to list tokens' }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;

        const body = await req.json();
        const name = body.name?.trim();

        if (!name) {
            return NextResponse.json({ error: 'Token name is required' }, { status: 400 });
        }

        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
        const { rawToken, prefix } = await generateToken(id, name, expiresAt);

        log.info(`Token "${name}" created for endpoint ${id}`);

        return NextResponse.json({ token: rawToken, prefix, name }, { status: 201 });
    } catch (error) {
        log.error('Failed to generate token', error);
        return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
    }
}
