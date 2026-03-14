import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getPasskeyLoginOptions, getRPID } from '@/lib/passkey-utils';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const logger = createLogger('api:auth:passkey:login:options');

export async function POST(req: NextRequest) {
    try {
        const { username } = await req.json().catch(() => ({}));
        
        await connectDB();
        
        let allowCredentials: { id: string; type: 'public-key'; transports: AuthenticatorTransport[] }[] = [];
        if (username) {
            const user = await User.findOne({ username, isActive: true });
            if (user) {
                allowCredentials = user.passkeys.map(pk => ({
                    id: pk.credentialID,
                    type: 'public-key',
                    transports: pk.transports as AuthenticatorTransport[],
                }));
            }
        }

        const host = req.headers.get('host') || 'localhost';
        const rpID = getRPID(host);

        const options = await getPasskeyLoginOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });

        const response = NextResponse.json(options);
        response.cookies.set('login-challenge', options.challenge, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 300, // 5 minutes
        });

        // Store the username in a cookie if provided, so we know who is trying to login
        if (username) {
            response.cookies.set('login-username', username, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 300,
            });
        }

        return response;
    } catch (error: unknown) {
        logger.error('Passkey login options error', error);
        return NextResponse.json({ error: 'Failed to generate login options' }, { status: 500 });
    }
}
