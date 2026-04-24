import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { Model } from 'mongoose';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import RouteTemplate, { RouteTemplateZodSchema } from '@/models/RouteTemplate';
import FleetLogEvent from '@/models/FleetLogEvent';
import { seedBuiltinTemplates } from '@/lib/fleet/templates';
import { recordAudit } from '@/lib/fleet/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const log = createLogger('api:fleet:templates');

interface SessionUser {
  user: { id?: string; username: string; role: string };
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const existingCount = await RouteTemplate.countDocuments({});
    if (existingCount === 0) {
      await seedBuiltinTemplates(RouteTemplate as unknown as Model<unknown>);
    }

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') || '';
    const filter: Record<string, unknown> = {};
    if (kind) filter.kind = kind;

    const templates = await RouteTemplate.find(filter).sort({ kind: 1, name: 1 }).lean();

    return NextResponse.json({ templates });
  } catch (error) {
    log.error('Failed to fetch templates', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getSession()) as SessionUser | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const parsed = RouteTemplateZodSchema.parse(body);

    const existing = await RouteTemplate.findOne({ slug: parsed.slug });
    if (existing) {
      return NextResponse.json(
        { error: `Slug "${parsed.slug}" is already taken` },
        { status: 409 }
      );
    }

    const created = await RouteTemplate.create({
      ...parsed,
      createdBy: session.user.username,
    });

    await recordAudit(FleetLogEvent as unknown as Model<unknown>, {
      action: 'template.create',
      actorUserId: session.user.username,
      metadata: { templateId: String(created._id), slug: parsed.slug },
    });

    return NextResponse.json({ template: created.toObject() }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    log.error('Failed to create template', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
