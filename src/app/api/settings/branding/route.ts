import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import BrandSettings from '@/models/BrandSettings';
import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:settings:branding');

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await connectDB();
        let settings = await BrandSettings.findById('brand-settings').lean();
        
        if (!settings) {
            settings = {
                pageTitle: 'ServerMon',
                logoBase64: '',
            };
        }

        return NextResponse.json(settings);
    } catch (err: unknown) {
        log.error('Failed to fetch branding settings', err);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = (await getSession()) as { user: { role: string } } | null;
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { pageTitle, logoBase64 } = body;

        await connectDB();
        const settings = await BrandSettings.findOneAndUpdate(
            { _id: 'brand-settings' },
            { 
                $set: { 
                    pageTitle: pageTitle || 'ServerMon',
                    logoBase64: logoBase64 || '',
                    updatedAt: new Date()
                } 
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({ success: true, settings });
    } catch (err: unknown) {
        log.error('Failed to update branding settings', err);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
