import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { verifyPassword } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
    try {
        await connectDB();

        const { username, password } = await req.json();

        const user = await User.findOne({ username, isActive: true });
        if (!user) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        const isValidPassword = await verifyPassword(password, user.passwordHash);
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Step 1 successful: Credentials verified
        // In a real app, you might want to issue a temporary "pre-auth" token here
        return NextResponse.json({ success: true, requiresTOTP: user.totpEnabled });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
