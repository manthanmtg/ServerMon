import { NextResponse } from 'next/server';
import { usersService } from '@/lib/users/service';
import { createLogger } from '@/lib/logger';
import { getSession } from '@/lib/session';

const log = createLogger('api:users');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const session = await getSession() as { user: { role: string } } | null;
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'os'; // 'os' or 'web'

        if (type === 'web') {
            const users = await usersService.listWebUsers();
            return NextResponse.json(users);
        } else {
            const users = await usersService.listOSUsers();
            return NextResponse.json(users);
        }
    } catch (err: unknown) {
        log.error('Failed to fetch users', err);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession() as { user: { role: string } } | null;
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { type, username, shell } = body;

        if (type === 'os') {
            await usersService.createOSUser(username, shell);
            return NextResponse.json({ message: 'OS user created successfully' });
        }

        return NextResponse.json({ error: 'Invalid user type' }, { status: 400 });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        log.error('Failed to create user', { error: errorMessage });
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await getSession() as { user: { role: string } } | null;
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { type, id, username, role, sudo } = body;

        if (type === 'web' && id && role) {
            await usersService.updateWebUserRole(id, role);
            return NextResponse.json({ message: 'Web user role updated' });
        }

        if (type === 'os' && username && typeof sudo === 'boolean') {
            await usersService.toggleSudo(username, sudo);
            return NextResponse.json({ message: 'OS user sudo privileges updated' });
        }

        return NextResponse.json({ error: 'Invalid update parameters' }, { status: 400 });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        log.error('Failed to update user', { error: errorMessage });
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await getSession() as { user: { role: string } } | null;
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');
        const username = searchParams.get('username');

        if (type === 'web' && id) {
            await usersService.deleteWebUser(id);
            return NextResponse.json({ message: 'Web user deleted' });
        }

        if (type === 'os' && username) {
            await usersService.deleteOSUser(username);
            return NextResponse.json({ message: 'OS user deleted' });
        }

        return NextResponse.json({ error: 'Invalid deletion parameters' }, { status: 400 });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        log.error('Failed to delete user', { error: errorMessage });
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
