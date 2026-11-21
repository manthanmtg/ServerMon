import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hashPassword, verifyTOTPToken } from '@/lib/auth-utils';

const SetupCompleteSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  totpSecret: z.string().min(1),
  totpToken: z.string().min(1),
});

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

    const body = await req.json();
    const result = SetupCompleteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { username, password, totpSecret, totpToken } = result.data;

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
