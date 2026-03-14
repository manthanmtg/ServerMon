import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getPasskeyRegistrationOptions, getRPID, RP_NAME } from '@/lib/passkey-utils';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const logger = createLogger('api:auth:passkey:register:options');

export async function GET(req: NextRequest) {
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

        const host = req.headers.get('host') || 'localhost';
        const rpID = getRPID(host);

        const options = await getPasskeyRegistrationOptions({
            rpName: RP_NAME,
            rpID,
            userID: new TextEncoder().encode(user._id.toString()),
            userName: user.username,
            userDisplayName: user.username,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
            excludeCredentials: user.passkeys.map(pk => ({
                id: pk.credentialID,
                type: 'public-key',
                transports: pk.transports as AuthenticatorTransport[],
            })),
        });

        // Store challenge in a short-lived cookie (10 minutes)
        const response = NextResponse.json(options);
        response.cookies.set('reg-challenge', options.challenge, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        });

        return response;
    } catch (error: unknown) {
        logger.error('Passkey register options error', error);
        return NextResponse.json({ error: 'Failed to generate registration options' }, { status: 500 });
    }
}
