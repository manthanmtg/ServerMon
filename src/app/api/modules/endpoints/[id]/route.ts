import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint, { CustomEndpointZodSchema } from '@/models/CustomEndpoint';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:detail');

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;

        const endpoint = await CustomEndpoint.findById(id)
            .select('-tokens.hashedToken')
            .lean();

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
        }

        return NextResponse.json(endpoint);
    } catch (error) {
        log.error('Failed to fetch endpoint', error);
        return NextResponse.json({ error: 'Failed to fetch endpoint' }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;
        const body = await req.json();

        const existing = await CustomEndpoint.findById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
        }

        const merged = {
            name: body.name ?? existing.name,
            slug: body.slug ?? existing.slug,
            description: body.description ?? existing.description,
            method: body.method ?? existing.method,
            endpointType: body.endpointType ?? existing.endpointType,
            scriptLang: body.scriptLang ?? existing.scriptLang,
            scriptContent: body.scriptContent ?? existing.scriptContent,
            logicConfig: body.logicConfig ?? existing.logicConfig,
            webhookConfig: body.webhookConfig ?? existing.webhookConfig,
            envVars: body.envVars ?? (existing.envVars instanceof Map ? Object.fromEntries(existing.envVars) : existing.envVars),
            auth: body.auth ?? existing.auth,
            tags: body.tags ?? existing.tags,
            enabled: body.enabled ?? existing.enabled,
            timeout: body.timeout ?? existing.timeout,
            responseHeaders: body.responseHeaders ?? (existing.responseHeaders instanceof Map ? Object.fromEntries(existing.responseHeaders) : existing.responseHeaders),
        };

        const parsed = CustomEndpointZodSchema.safeParse(merged);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        if (parsed.data.slug !== existing.slug) {
            const slugConflict = await CustomEndpoint.findOne({
                slug: parsed.data.slug,
                _id: { $ne: id },
            });
            if (slugConflict) {
                return NextResponse.json(
                    { error: `Slug "${parsed.data.slug}" is already taken` },
                    { status: 409 }
                );
            }
        }

        const updated = await CustomEndpoint.findByIdAndUpdate(id, parsed.data, {
            new: true,
        })
            .select('-tokens.hashedToken')
            .lean();

        log.info(`Endpoint updated: ${updated?.name} (${updated?.slug})`);

        return NextResponse.json(updated);
    } catch (error) {
        log.error('Failed to update endpoint', error);
        return NextResponse.json({ error: 'Failed to update endpoint' }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;

        const endpoint = await CustomEndpoint.findByIdAndDelete(id);
        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
        }

        log.info(`Endpoint deleted: ${endpoint.name} (${endpoint.slug})`);

        return NextResponse.json({ success: true });
    } catch (error) {
        log.error('Failed to delete endpoint', error);
        return NextResponse.json({ error: 'Failed to delete endpoint' }, { status: 500 });
    }
}
