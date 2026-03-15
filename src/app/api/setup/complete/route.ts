import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hashPassword, verifyTOTPToken } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    // Check if any admin/user already exists
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return NextResponse.json(
        { error: 'System already setup. Setup wizard is disabled.' },
        { status: 403 }
      );
    }

    const { username, password, totpSecret, totpToken } = await req.json();

    // Verify TOTP token
    const isValidToken = verifyTOTPToken(totpToken, totpSecret);
    if (!isValidToken) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Create the primary administrator account
    const hashedPassword = await hashPassword(password);
    const admin = await User.create({
      username,
      passwordHash: hashedPassword,
      role: 'admin',
      totpSecret,
      totpEnabled: true,
      isActive: true,
    });

    return NextResponse.json({ success: true, userId: admin._id });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
