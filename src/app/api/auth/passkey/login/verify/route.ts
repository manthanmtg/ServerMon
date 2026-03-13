import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { verifyPasskeyLogin, getRPID, getOrigin } from '@/lib/passkey-utils';
import { login } from '@/lib/session';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const logger = createLogger('api:auth:passkey:login:verify');

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const challenge = req.cookies.get('login-challenge')?.value;
        const usernameInCookie = req.cookies.get('login-username')?.value;

        if (!challenge) {
            return NextResponse.json({ error: 'Login challenge missing or expired' }, { status: 400 });
        }

        await connectDB();

        // 1. Find the user. Either by the stored username or by searching for the credential ID.
        let user;
        if (usernameInCookie) {
            user = await User.findOne({ username: usernameInCookie, isActive: true });
        } else {
            // Generic login: search for the user who owns this credential
            user = await User.findOne({ 'passkeys.credentialID': body.id, isActive: true });
        }

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // 2. Find the specific passkey in the user's list
        const passkey = user.passkeys.find(pk => pk.credentialID === body.id);
        if (!passkey) {
            return NextResponse.json({ error: 'Passkey not found on user' }, { status: 400 });
        }

        const host = req.headers.get('host') || 'localhost';
        const rpID = getRPID(host);
        const origin = getOrigin(req);

        // 3. Verify the authentication response
        const verification = await verifyPasskeyLogin({
            response: body,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialID,
                publicKey: new Uint8Array(passkey.publicKey as Buffer),
                counter: passkey.counter,
            },
        });

        if (verification.verified && verification.authenticationInfo) {
            // 4. Update the counter to prevent replay attacks
            passkey.counter = verification.authenticationInfo.newCounter;
            user.lastLoginAt = new Date();
            await user.save();

            // 5. Create session
            await login({
                id: user._id.toString(),
                username: user.username,
                role: user.role,
            });

            const response = NextResponse.json({ success: true });
            response.cookies.delete('login-challenge');
            response.cookies.delete('login-username');
            return response;
        } else {
            return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
        }
    } catch (error: unknown) {
        logger.error('Passkey login verify error', error);
        return NextResponse.json({ error: 'Failed to verify login' }, { status: 500 });
    }
}
