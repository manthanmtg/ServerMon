import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { verifyPasskeyLogin, getRPID, getOrigin } from '@/lib/passkey-utils';
import { login } from '@/lib/session';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const logger = createLogger('api:auth:passkey:login:verify');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const challenge = req.cookies.get('login-challenge')?.value;

    if (!challenge) {
      return NextResponse.json({ error: 'Login challenge missing or expired' }, { status: 400 });
    }

    const conn = await connectDB();

    // Redacted reveal of DB name to confirm connectivity
    const dbName = conn.connection.name;
    logger.info(`Checking passkey login. DB: ${dbName}, ID prefix: ${body.id?.slice(0, 10)}...`);

    // 1. Find the user who owns this credential.
    // We handle a legacy bug where IDs were doubly-encoded during registration.
    const credentialID = body.id;
    const legacyEncodedID = Buffer.from(body.id).toString('base64url');

    logger.info(`Searching for user with ID: ${credentialID} or legacy: ${legacyEncodedID}`);

    const user = await User.findOne({
      'passkeys.credentialID': { $in: [credentialID, legacyEncodedID] },
      isActive: true,
    });

    if (!user) {
      logger.warn(`Passkey mismatch: No user found with credentialID: ${credentialID}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info(`Found user ${user.username} for passkey.`);

    // 2. Find the specific passkey in the user's list
    const passkey = user.passkeys.find(
      (pk) =>
        String(pk.credentialID) === credentialID || String(pk.credentialID) === legacyEncodedID
    );
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
