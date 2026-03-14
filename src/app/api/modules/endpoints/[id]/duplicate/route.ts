import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';

export const dynamic = 'force-dynamic';

const log = createLogger('api:endpoints:duplicate');

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;

        const source = await CustomEndpoint.findById(id).lean();
        if (!source) {
            return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
        }

        let newSlug = `${source.slug}-copy`;
        let suffix = 1;
        while (await CustomEndpoint.findOne({ slug: newSlug })) {
            suffix++;
            newSlug = `${source.slug}-copy-${suffix}`;
        }

        const duplicate = await CustomEndpoint.create({
            name: `${source.name} (Copy)`,
            slug: newSlug,
            description: source.description,
            method: source.method,
            endpointType: source.endpointType,
            scriptLang: source.scriptLang,
            scriptContent: source.scriptContent,
            logicConfig: source.logicConfig,
            webhookConfig: source.webhookConfig,
            envVars: source.envVars,
            auth: source.auth,
            tags: source.tags,
            enabled: false,
            timeout: source.timeout,
            responseHeaders: source.responseHeaders,
            tokens: [],
            executionCount: 0,
        });

        log.info(`Endpoint duplicated: ${source.slug} -> ${duplicate.slug}`);

        return NextResponse.json(duplicate.toObject(), { status: 201 });
    } catch (error) {
        log.error('Failed to duplicate endpoint', error);
        return NextResponse.json({ error: 'Failed to duplicate endpoint' }, { status: 500 });
    }
}
