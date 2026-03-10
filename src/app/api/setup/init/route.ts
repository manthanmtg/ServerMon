import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { generateTOTPSecret, generateQRCode } from '@/lib/auth-utils';

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

        const { username } = await req.json();
        if (!username || username.length < 3) {
            return NextResponse.json(
                { error: 'Valid username is required' },
                { status: 400 }
            );
        }

        // Generate TOTP Secret and QR Code for enrollment
        const secret = generateTOTPSecret();
        const qrCode = await generateQRCode(username, secret);

        return NextResponse.json({ secret, qrCode });
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
