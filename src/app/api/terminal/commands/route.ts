import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import SavedCommand from '@/models/SavedCommand';
import { getSession } from '@/lib/session';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger('api:terminal:commands');

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const commands = await SavedCommand.find().sort({ category: 1, name: 1 }).lean();
    return NextResponse.json({ commands });
  } catch (error) {
    log.error('Failed to fetch saved commands', error);
    return NextResponse.json({ error: 'Failed to fetch saved commands' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = (await getSession()) as {
      user?: { username?: string; role?: string };
    } | null;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();

    const { name, command, description, category } = body;
    if (!name?.trim() || !command?.trim()) {
      return NextResponse.json({ error: 'Name and command are required' }, { status: 400 });
    }

    const saved = await SavedCommand.create({
      name: name.trim().slice(0, 100),
      command: command.trim().slice(0, 2000),
      description: (description || '').trim().slice(0, 500),
      category: (category || 'General').trim().slice(0, 50),
      createdBy: session.user.username || 'unknown',
    });

    return NextResponse.json({ command: saved.toObject() }, { status: 201 });
  } catch (error) {
    log.error('Failed to create saved command', error);
    return NextResponse.json({ error: 'Failed to create saved command' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = (await getSession()) as {
      user?: { username?: string; role?: string };
    } | null;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();

    const { id, name, command, description, category } = body;
    if (!id) {
      return NextResponse.json({ error: 'Command ID is required' }, { status: 400 });
    }
    if (!name?.trim() || !command?.trim()) {
      return NextResponse.json({ error: 'Name and command are required' }, { status: 400 });
    }

    const updated = await SavedCommand.findByIdAndUpdate(
      id,
      {
        $set: {
          name: name.trim().slice(0, 100),
          command: command.trim().slice(0, 2000),
          description: (description || '').trim().slice(0, 500),
          category: (category || 'General').trim().slice(0, 50),
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    return NextResponse.json({ command: updated });
  } catch (error) {
    log.error('Failed to update saved command', error);
    return NextResponse.json({ error: 'Failed to update saved command' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Command ID is required' }, { status: 400 });
    }

    const deleted = await SavedCommand.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to delete saved command', error);
    return NextResponse.json({ error: 'Failed to delete saved command' }, { status: 500 });
  }
}
