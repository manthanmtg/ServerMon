import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { verifyPassword, verifyTOTPToken } from '@/lib/auth-utils';
import { login } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { username, password, totpToken } = await req.json();

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (user.totpEnabled && user.totpSecret) {
      const isValidTOTP = verifyTOTPToken(totpToken, user.totpSecret);
      if (!isValidTOTP) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
      }
    }

    await login({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    });

    user.lastLoginAt = new Date();
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
