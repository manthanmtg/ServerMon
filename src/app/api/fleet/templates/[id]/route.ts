import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import RouteTemplate, { RouteTemplateZodSchema } from '@/models/RouteTemplate';
import FleetLogEvent from '@/models/FleetLogEvent';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:templates:detail');

const PatchZ = RouteTemplateZodSchema.partial();

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const template = await RouteTemplate.findById(id).lean();
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    log.error('Failed to fetch template', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const existing = await RouteTemplate.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.kind === 'builtin') {
      return NextResponse.json({ error: 'Cannot modify builtin templates' }, { status: 409 });
    }

    const body = await req.json();
    const updates = PatchZ.parse(body);

    const updated = await RouteTemplate.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'template.update',
      actorUserId: session.user.username,
      metadata: { templateId: id },
    });

    return NextResponse.json({ template: updated.toObject() });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to update template', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const template = await RouteTemplate.findById(id);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (template.kind === 'builtin') {
      return NextResponse.json({ error: 'Cannot modify builtin templates' }, { status: 409 });
    }

    await RouteTemplate.findByIdAndDelete(id);

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'template.delete',
      actorUserId: session.user.username,
      metadata: { templateId: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error('Failed to delete template', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
