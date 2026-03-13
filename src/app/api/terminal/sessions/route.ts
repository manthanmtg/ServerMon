import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import TerminalSession from '@/models/TerminalSession';
import TerminalSettings from '@/models/TerminalSettings';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';
import TerminalHistory from '@/models/TerminalHistory';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
const log = createLogger('api:terminal:sessions');

interface SessionUser {
    username: string;
}

export async function GET() {
    try {
        await connectDB();
        const sessions = await TerminalSession.find().sort({ order: 1, createdAt: 1 }).lean();
        return NextResponse.json({ sessions });
    } catch (error) {
        log.error('Failed to fetch sessions', error);
        return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await connectDB();
        // User check not needed here as history is created in server.ts
        // but we'll keep getSession call to ensure authorized
        await getSession();

        const settings = await TerminalSettings.findById('terminal-settings').lean();
        const maxSessions = settings?.maxSessions ?? 8;
        const count = await TerminalSession.countDocuments();
        if (count >= maxSessions) {
            return NextResponse.json(
                { error: `Maximum ${maxSessions} sessions allowed` },
                { status: 400 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const label = body.label || `Terminal ${count + 1}`;
        const sessionId = crypto.randomUUID();

        const session = await TerminalSession.create({
            sessionId,
            label,
            order: count,
        });

        return NextResponse.json({ session }, { status: 201 });
    } catch (error) {
        log.error('Failed to create session', error);
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        await connectDB();
        const { sessionId, label, lastActiveAt } = await request.json();
        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
        }

        const update: Record<string, unknown> = {};
        if (label !== undefined) update.label = label;
        if (lastActiveAt) update.lastActiveAt = new Date(lastActiveAt);

        const session = await TerminalSession.findOneAndUpdate(
            { sessionId },
            { $set: update },
            { new: true }
        ).lean();

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({ session });
    } catch (error) {
        log.error('Failed to update session', error);
        return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        await connectDB();
        const sessionPayload = await getSession();
        const user = sessionPayload?.user as SessionUser | undefined;
        const username = user?.username || 'unknown';

        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');
        const resetAll = searchParams.get('resetAll');

        if (resetAll === 'true') {
            await TerminalSession.deleteMany({});
            const session = await TerminalSession.create({
                sessionId: crypto.randomUUID(),
                label: 'Terminal 1',
                order: 0,
            });
            return NextResponse.json({ sessions: [session] });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
        }

        await TerminalSession.deleteOne({ sessionId });

        // Update history
        const history = await TerminalHistory.findOne({ 
            sessionId, 
            closedAt: { $exists: false } 
        });
        if (history) {
            history.closedAt = new Date();
            history.closedBy = `user:${username}`;
            await history.save();
        }

        const remaining = await TerminalSession.countDocuments();
        if (remaining === 0) {
            const session = await TerminalSession.create({
                sessionId: crypto.randomUUID(),
                label: 'Terminal 1',
                order: 0,
            });
            return NextResponse.json({ sessions: [session], wasLast: true });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        log.error('Failed to delete session', error);
        return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
}
