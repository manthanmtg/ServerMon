import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { verifyPasskeyRegistration, getRPID, getOrigin } from '@/lib/passkey-utils';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const logger = createLogger('api:auth:passkey:register:verify');

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const challenge = req.cookies.get('reg-challenge')?.value;

    if (!challenge) {
      return NextResponse.json(
        { error: 'Registration challenge missing or expired' },
        { status: 400 }
      );
    }

    await connectDB();
    const userId = (session.user as { id: string }).id;
    const user = await User.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const host = req.headers.get('host') || 'localhost';
    const rpID = getRPID(host);
    const origin = getOrigin(req);

    const verification = await verifyPasskeyRegistration({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { id, publicKey, counter } = verification.registrationInfo.credential;
      const credentialID = String(id);

      // Check if credential already exists
      const existing = user.passkeys.find((pk) => pk.credentialID === credentialID);
      if (!existing) {
        user.passkeys.push({
          credentialID,
          publicKey: Buffer.from(publicKey),
          counter,
          transports: (body.response as { transports?: string[] }).transports || [],
          createdAt: new Date(),
        });

        user.markModified('passkeys');
        await user.save();
      }

      const response = NextResponse.json({ success: true });
      response.cookies.delete('reg-challenge');
      return response;
    } else {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }
  } catch (error: unknown) {
    logger.error('Passkey register verify error', error);
    return NextResponse.json({ error: 'Failed to verify registration' }, { status: 500 });
  }
}
