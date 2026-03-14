import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const logger = createLogger('api:auth:passkey:list');

export async function GET() {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const userId = (session.user as { id: string }).id;
        const user = await User.findById(userId);

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({
            passkeys: user.passkeys.map(pk => ({
                id: pk.credentialID,
                createdAt: pk.createdAt,
            })),
        });
    } catch (error: unknown) {
        logger.error('Failed to list passkeys', error);
        return NextResponse.json({ error: 'Failed to list passkeys' }, { status: 500 });
    }
}
