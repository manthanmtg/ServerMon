import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint, { CustomEndpointZodSchema } from '@/models/CustomEndpoint';
import { slugify } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:create');

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();

    if (!body.slug && body.name) {
      body.slug = slugify(body.name);
    }

    const parsed = CustomEndpointZodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await CustomEndpoint.findOne({ slug: parsed.data.slug });
    if (existing) {
      return NextResponse.json(
        { error: `Endpoint with slug "${parsed.data.slug}" already exists` },
        { status: 409 }
      );
    }

    const endpoint = await CustomEndpoint.create({
      ...parsed.data,
      tokens: [],
      executionCount: 0,
    });

    log.info(`Endpoint created: ${endpoint.name} (${endpoint.slug})`);

    return NextResponse.json(endpoint.toObject(), { status: 201 });
  } catch (error) {
    log.error('Failed to create endpoint', error);
    return NextResponse.json({ error: 'Failed to create endpoint' }, { status: 500 });
  }
}
