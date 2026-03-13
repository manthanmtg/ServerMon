import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const logger = createLogger('api:auth:passkey:delete');

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { credentialID } = await req.json();
        if (!credentialID) {
            return NextResponse.json({ error: 'Credential ID required' }, { status: 400 });
        }

        await connectDB();
        const userId = (session.user as { id: string }).id;
        const user = await User.findById(userId);

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        user.passkeys = user.passkeys.filter(pk => pk.credentialID !== credentialID);
        await user.save();

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error('Failed to delete passkey', error);
        return NextResponse.json({ error: 'Failed to delete passkey' }, { status: 500 });
    }
}
