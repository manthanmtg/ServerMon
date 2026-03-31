import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { searchTemplates, getAllTemplates, toListItem } from '@/modules/self-service/templates';
import type { TemplateCategory } from '@/modules/self-service/types';

export const dynamic = 'force-dynamic';

const log = createLogger('api:self-service:templates');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || undefined;
    const category = searchParams.get('category') as TemplateCategory | null;
    const tagsParam = searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()) : undefined;

    const hasFilters = query || category || tags;

    const templates = hasFilters
      ? searchTemplates({
          query: query || undefined,
          category: category || undefined,
          tags,
        })
      : getAllTemplates();

    return NextResponse.json({
      templates: templates.map(toListItem),
      total: templates.length,
    });
  } catch (error) {
    log.error('Failed to list templates', error);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}
