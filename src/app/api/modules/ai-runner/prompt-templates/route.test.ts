/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { mockRequireSession, mockListPromptTemplates, mockCreatePromptTemplate, mockParseBody, mockZodErrorResponse, mockLogError } =
  vi.hoisted(() => ({
    mockRequireSession: vi.fn(),
    mockListPromptTemplates: vi.fn(),
    mockCreatePromptTemplate: vi.fn(),
    mockParseBody: vi.fn(),
    mockZodErrorResponse: vi.fn(),
    mockLogError: vi.fn(),
  }));

vi.mock('@/lib/ai-runner/service', () => ({
  getAIRunnerService: () => ({
    listPromptTemplates: mockListPromptTemplates,
    createPromptTemplate: mockCreatePromptTemplate,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mockLogError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../_shared', () => ({
  requireSession: mockRequireSession,
  parseBody: mockParseBody,
  zodErrorResponse: mockZodErrorResponse,
}));

import { GET, POST } from './route';

describe('AI Runner prompt templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockZodErrorResponse.mockReset();
  });

  it('returns unauthorized for GET when session is missing', async () => {
    mockRequireSession.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockListPromptTemplates).not.toHaveBeenCalled();
  });

  it('returns prompt templates list for GET', async () => {
    const templates = [
      { id: 't1', name: 'Template 1', content: 'echo hi', description: 'demo', tags: [] },
      { id: 't2', name: 'Template 2', content: 'echo bye', description: null, tags: ['ops'] },
    ];
    mockRequireSession.mockResolvedValue(null);
    mockListPromptTemplates.mockResolvedValue(templates);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(templates);
  });

  it('returns 500 when listing prompt templates fails', async () => {
    mockRequireSession.mockResolvedValue(null);
    mockListPromptTemplates.mockRejectedValue(new Error('database offline'));

    const response = await GET();

    expect(mockLogError).toHaveBeenCalledWith('Failed to list AI runner prompt templates', expect.any(Error));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to list prompt templates' });
  });

  it('returns unauthorized for POST when session is missing', async () => {
    mockRequireSession.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    const response = await POST(new Request('http://localhost/api/modules/ai-runner/prompt-templates', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockParseBody).not.toHaveBeenCalled();
    expect(mockCreatePromptTemplate).not.toHaveBeenCalled();
  });

  it('creates a prompt template for POST', async () => {
    mockRequireSession.mockResolvedValue(null);
    const body = { name: 'Template 1', content: 'do work', description: 'notes', tags: ['ops'] };
    const created = { ...body, id: 'template-1' };
    mockParseBody.mockResolvedValue(body);
    mockCreatePromptTemplate.mockResolvedValue(created);

    const response = await POST(new Request('http://localhost/api/modules/ai-runner/prompt-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

    expect(mockParseBody).toHaveBeenCalledWith(expect.any(Request), expect.anything());
    expect(mockCreatePromptTemplate).toHaveBeenCalledWith(body);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
  });

  it('returns zod validation response for invalid POST input', async () => {
    mockRequireSession.mockResolvedValue(null);
    const parseError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: ['name'],
        message: 'Required',
      },
    ]);
    const zodErrorResponse = new Response(JSON.stringify({ error: 'Validation failed' }), { status: 400 });
    mockParseBody.mockRejectedValue(parseError);
    mockZodErrorResponse.mockReturnValue(zodErrorResponse);

    const response = await POST(new Request('http://localhost/api/modules/ai-runner/prompt-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }));

    expect(mockZodErrorResponse).toHaveBeenCalledWith(parseError);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Validation failed' });
    expect(mockCreatePromptTemplate).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('returns 400 with generic message for unexpected POST errors', async () => {
    mockRequireSession.mockResolvedValue(null);
    mockParseBody.mockResolvedValue({ name: 'Template 1', content: 'do work' });
    mockCreatePromptTemplate.mockRejectedValue(new Error('failed to write'));

    const response = await POST(new Request('http://localhost/api/modules/ai-runner/prompt-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Template 1', content: 'do work' }),
    }));

    expect(response.status).toBe(400);
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to create AI runner prompt template',
      expect.any(Error)
    );
    expect(await response.json()).toEqual({ error: 'failed to write' });
  });
});
