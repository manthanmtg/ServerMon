/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetAllTemplates, mockSearchTemplates, mockToListItem, mockLogError } = vi.hoisted(
  () => ({
    mockGetAllTemplates: vi.fn(),
    mockSearchTemplates: vi.fn(),
    mockToListItem: vi.fn((template: { id: string }) => ({
      id: template.id,
      name: `Template ${template.id}`,
    })),
    mockLogError: vi.fn(),
  })
);

vi.mock('@/modules/self-service/templates', () => ({
  getAllTemplates: mockGetAllTemplates,
  searchTemplates: mockSearchTemplates,
  toListItem: mockToListItem,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

import { GET } from './route';

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/modules/self-service/templates');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
}

describe('GET /api/modules/self-service/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTemplates.mockReturnValue([{ id: 'n8n' }, { id: 'gitea' }]);
    mockSearchTemplates.mockReturnValue([{ id: 'gitea' }]);
  });

  it('returns all templates when no filters are provided', async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(mockGetAllTemplates).toHaveBeenCalledTimes(1);
    expect(mockSearchTemplates).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      templates: [
        { id: 'n8n', name: 'Template n8n' },
        { id: 'gitea', name: 'Template gitea' },
      ],
      total: 2,
    });
  });

  it('searches templates by query text', async () => {
    const response = await GET(makeRequest({ q: 'git' }));

    expect(response.status).toBe(200);
    expect(mockSearchTemplates).toHaveBeenCalledWith({ query: 'git', category: undefined });
    await expect(response.json()).resolves.toEqual({
      templates: [{ id: 'gitea', name: 'Template gitea' }],
      total: 1,
    });
  });

  it('searches templates by category', async () => {
    await GET(makeRequest({ category: 'service' }));

    expect(mockSearchTemplates).toHaveBeenCalledWith({
      query: undefined,
      category: 'service',
    });
  });

  it('trims tag filters and ignores blank tag entries', async () => {
    await GET(makeRequest({ tags: 'docker, , monitoring,' }));

    expect(mockSearchTemplates).toHaveBeenCalledWith({
      query: undefined,
      category: undefined,
      tags: ['docker', 'monitoring'],
    });
  });

  it('does not treat entirely blank tags as a filter', async () => {
    const response = await GET(makeRequest({ tags: ' , ' }));

    expect(response.status).toBe(200);
    expect(mockGetAllTemplates).toHaveBeenCalledTimes(1);
    expect(mockSearchTemplates).not.toHaveBeenCalled();
  });

  it('logs and returns a generic error when template listing fails', async () => {
    const error = new Error('template registry unavailable');
    mockGetAllTemplates.mockImplementation(() => {
      throw error;
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledWith('Failed to list templates', error);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to list templates' });
  });
});
