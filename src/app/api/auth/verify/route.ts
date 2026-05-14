import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { verifyPassword } from '@/lib/auth-utils';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const logger = createLogger('api:auth:verify');

const VerifySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const result = VerifySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { username, password } = result.data;

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    return NextResponse.json({ success: true, requiresTOTP: user.totpEnabled });
  } catch (error: unknown) {
    logger.error('Verify failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
