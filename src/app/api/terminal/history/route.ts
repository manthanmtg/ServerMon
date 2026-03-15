import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import TerminalHistory from '@/models/TerminalHistory';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger('api:terminal:history');

export async function GET() {
  try {
    await connectDB();
    // Fetch last 50 sessions by default, latest first
    const history = await TerminalHistory.find().sort({ createdAt: -1 }).limit(50).lean();

    return NextResponse.json({ history });
  } catch (error) {
    log.error('Failed to fetch terminal history', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
