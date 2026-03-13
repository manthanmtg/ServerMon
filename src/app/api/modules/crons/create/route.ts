import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { cronsService } from '@/lib/crons/service';

export const dynamic = 'force-dynamic';

const log = createLogger('api:crons:create');

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { minute, hour, dayOfMonth, month, dayOfWeek, command, comment, user } = body;

        if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek || !command) {
            return NextResponse.json(
                { error: 'Missing required fields: minute, hour, dayOfMonth, month, dayOfWeek, command' },
                { status: 400 }
            );
        }

        const result = await cronsService.createJob({
            minute,
            hour,
            dayOfMonth,
            month,
            dayOfWeek,
            command,
            comment,
            user,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 500 });
        }

        return NextResponse.json(result);
    } catch (error) {
        log.error('Failed to create cron job', error);
        return NextResponse.json({ error: 'Failed to create cron job' }, { status: 500 });
    }
}
