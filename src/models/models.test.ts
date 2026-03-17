/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mongoose so we don't need a real DB connection
vi.mock('mongoose', async () => {
  const modelStore: Record<string, unknown> = {};

  const mockSchema = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    definition: unknown,
    options?: unknown
  ) {
    this.definition = definition;
    this.options = options;
    this.indexes = [] as unknown[];
    this.pre = vi.fn();
    this.index = vi.fn((...args: unknown[]) => {
      (this.indexes as unknown[]).push(args);
    });
    return this;
  }) as unknown as { Types: { ObjectId: unknown; Mixed: unknown } };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockSchema as any).Types = {
    ObjectId: 'ObjectId',
    Mixed: 'Mixed',
  };

  const mockModel = vi.fn().mockImplementation((name: string) => {
    modelStore[name] = { modelName: name };
    return modelStore[name];
  });

  return {
    default: {
      Schema: mockSchema,
      model: mockModel,
      models: modelStore,
      Types: { ObjectId: 'ObjectId', Mixed: 'Mixed' },
    },
    Schema: mockSchema,
    Document: {},
    Model: {},
  };
});

// Mock zod (used by User and CustomEndpoint)
vi.mock('zod', async () => {
  const actual = await vi.importActual<typeof import('zod')>('zod');
  return actual;
});

describe('Mongoose Models', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('User model', () => {
    it('exports a model and UserZodSchema', async () => {
      const mod = await import('./User');
      expect(mod.default).toBeDefined();
      expect(mod.UserZodSchema).toBeDefined();
    });

    it('UserZodSchema validates a valid user', async () => {
      const { UserZodSchema } = await import('./User');
      const result = UserZodSchema.safeParse({
        username: 'admin',
        passwordHash: 'hash123',
        role: 'admin',
        totpEnabled: false,
        passkeys: [],
        isActive: true,
      });
      expect(result.success).toBe(true);
    });

    it('UserZodSchema rejects username too short', async () => {
      const { UserZodSchema } = await import('./User');
      const result = UserZodSchema.safeParse({
        username: 'ab',
        passwordHash: 'hash123',
      });
      expect(result.success).toBe(false);
    });

    it('UserZodSchema rejects invalid role', async () => {
      const { UserZodSchema } = await import('./User');
      const result = UserZodSchema.safeParse({
        username: 'admin',
        passwordHash: 'hash123',
        role: 'superadmin',
      });
      expect(result.success).toBe(false);
    });

    it('UserZodSchema applies default role of user', async () => {
      const { UserZodSchema } = await import('./User');
      const result = UserZodSchema.safeParse({
        username: 'testuser',
        passwordHash: 'hash123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('user');
      }
    });
  });

  describe('AnalyticsEvent model', () => {
    it('exports a model', async () => {
      const mod = await import('./AnalyticsEvent');
      expect(mod.default).toBeDefined();
    });
  });

  describe('BrandSettings model', () => {
    it('exports a model', async () => {
      const mod = await import('./BrandSettings');
      expect(mod.default).toBeDefined();
    });
  });

  describe('CustomEndpoint model', () => {
    it('exports a model and CustomEndpointZodSchema', async () => {
      const mod = await import('./CustomEndpoint');
      expect(mod.default).toBeDefined();
      expect(mod.CustomEndpointZodSchema).toBeDefined();
    });

    it('CustomEndpointZodSchema validates a valid endpoint', async () => {
      const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
      const result = CustomEndpointZodSchema.safeParse({
        name: 'My Endpoint',
        slug: 'my-endpoint',
        method: 'GET',
        endpointType: 'script',
        auth: 'public',
        tags: [],
        enabled: true,
        timeout: 30000,
      });
      expect(result.success).toBe(true);
    });

    it('CustomEndpointZodSchema rejects invalid slug', async () => {
      const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
      const result = CustomEndpointZodSchema.safeParse({
        name: 'Test',
        slug: 'Invalid Slug!',
        method: 'GET',
        endpointType: 'script',
      });
      expect(result.success).toBe(false);
    });

    it('CustomEndpointZodSchema rejects invalid method', async () => {
      const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
      const result = CustomEndpointZodSchema.safeParse({
        name: 'Test',
        slug: 'test',
        method: 'INVALID',
        endpointType: 'script',
      });
      expect(result.success).toBe(false);
    });

    it('CustomEndpointZodSchema rejects timeout out of range', async () => {
      const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
      const result = CustomEndpointZodSchema.safeParse({
        name: 'Test',
        slug: 'test',
        method: 'GET',
        endpointType: 'script',
        timeout: 500,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DiskSettings model', () => {
    it('exports a model and IDiskSettings interface', async () => {
      const mod = await import('./DiskSettings');
      expect(mod.default).toBeDefined();
    });
  });

  describe('DockerAlert model', () => {
    it('exports a model', async () => {
      const mod = await import('./DockerAlert');
      expect(mod.default).toBeDefined();
    });
  });

  describe('DockerStatAggregate model', () => {
    it('exports a model', async () => {
      const mod = await import('./DockerStatAggregate');
      expect(mod.default).toBeDefined();
    });
  });

  describe('EndpointExecutionLog model', () => {
    it('exports a model', async () => {
      const mod = await import('./EndpointExecutionLog');
      expect(mod.default).toBeDefined();
    });
  });

  describe('FileBrowserSettings model', () => {
    it('exports a model', async () => {
      const mod = await import('./FileBrowserSettings');
      expect(mod.default).toBeDefined();
    });
  });

  describe('NetworkAlert model', () => {
    it('exports a model', async () => {
      const mod = await import('./NetworkAlert');
      expect(mod.default).toBeDefined();
    });
  });

  describe('NetworkStatAggregate model', () => {
    it('exports a model', async () => {
      const mod = await import('./NetworkStatAggregate');
      expect(mod.default).toBeDefined();
    });
  });

  describe('SavedCommand model', () => {
    it('exports a model', async () => {
      const mod = await import('./SavedCommand');
      expect(mod.default).toBeDefined();
    });
  });

  describe('ServiceAlert model', () => {
    it('exports a model', async () => {
      const mod = await import('./ServiceAlert');
      expect(mod.default).toBeDefined();
    });
  });

  describe('TerminalHistory model', () => {
    it('exports a model', async () => {
      const mod = await import('./TerminalHistory');
      expect(mod.default).toBeDefined();
    });
  });

  describe('TerminalSession model', () => {
    it('exports a model', async () => {
      const mod = await import('./TerminalSession');
      expect(mod.default).toBeDefined();
    });
  });

  describe('TerminalSettings model', () => {
    it('exports a model', async () => {
      const mod = await import('./TerminalSettings');
      expect(mod.default).toBeDefined();
    });
  });

  describe('UpdateAlert model', () => {
    it('exports a model', async () => {
      const mod = await import('./UpdateAlert');
      expect(mod.default).toBeDefined();
    });
  });

  describe('UpdateHistory model', () => {
    it('exports a model', async () => {
      const mod = await import('./UpdateHistory');
      expect(mod.default).toBeDefined();
    });
  });

  describe('QuickAccessSettings model', () => {
    it('exports a model', async () => {
      const mod = await import('./QuickAccessSettings');
      expect(mod.default).toBeDefined();
    });
  });
});

// ── Extended Zod schema tests ──────────────────────────────────────────────────

describe('UserZodSchema — extended validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('applies default totpEnabled=false', async () => {
    const { UserZodSchema } = await import('./User');
    const result = UserZodSchema.safeParse({
      username: 'admin',
      passwordHash: 'hash',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totpEnabled).toBe(false);
    }
  });

  it('applies default isActive=true', async () => {
    const { UserZodSchema } = await import('./User');
    const result = UserZodSchema.safeParse({
      username: 'admin',
      passwordHash: 'hash',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it('rejects username longer than 20 characters', async () => {
    const { UserZodSchema } = await import('./User');
    const result = UserZodSchema.safeParse({
      username: 'a'.repeat(21),
      passwordHash: 'hash',
    });
    expect(result.success).toBe(false);
  });

  it('accepts both admin and user roles', async () => {
    const { UserZodSchema } = await import('./User');
    for (const role of ['admin', 'user'] as const) {
      const result = UserZodSchema.safeParse({
        username: 'testuser',
        passwordHash: 'hash',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts an empty passkeys array', async () => {
    const { UserZodSchema } = await import('./User');
    const result = UserZodSchema.safeParse({
      username: 'admin',
      passwordHash: 'hash',
      passkeys: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passkeys).toEqual([]);
    }
  });
});

describe('CustomEndpointZodSchema — extended validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('accepts a valid webhook endpoint config', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Webhook Endpoint',
      slug: 'webhook-endpoint',
      method: 'POST',
      endpointType: 'webhook',
      webhookConfig: {
        targetUrl: 'https://example.com/hook',
        method: 'POST',
        forwardHeaders: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a webhook config with an invalid targetUrl', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Bad Webhook',
      slug: 'bad-webhook',
      method: 'POST',
      endpointType: 'webhook',
      webhookConfig: {
        targetUrl: 'not-a-url',
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid logic endpoint config', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Logic Endpoint',
      slug: 'logic-endpoint',
      method: 'POST',
      endpointType: 'logic',
      logicConfig: {
        handlerCode: 'return { status: "ok" }',
      },
    });
    expect(result.success).toBe(true);
  });

  it('applies default auth=public', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Test',
      slug: 'test',
      method: 'GET',
      endpointType: 'script',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auth).toBe('public');
    }
  });

  it('applies default enabled=true', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Test',
      slug: 'test',
      method: 'GET',
      endpointType: 'script',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it('rejects tags array exceeding 20 items', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Test',
      slug: 'test',
      method: 'GET',
      endpointType: 'script',
      tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid HTTP methods', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const result = CustomEndpointZodSchema.safeParse({
        name: `${method} Endpoint`,
        slug: `${method.toLowerCase()}-endpoint`,
        method,
        endpointType: 'script',
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid script languages', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    for (const lang of ['python', 'bash', 'node'] as const) {
      const result = CustomEndpointZodSchema.safeParse({
        name: 'Script',
        slug: 'script',
        method: 'POST',
        endpointType: 'script',
        scriptLang: lang,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid script language', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Script',
      slug: 'script',
      method: 'POST',
      endpointType: 'script',
      scriptLang: 'ruby',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 100 characters', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'a'.repeat(101),
      slug: 'test',
      method: 'GET',
      endpointType: 'script',
    });
    expect(result.success).toBe(false);
  });

  it('accepts envVars as a record', async () => {
    const { CustomEndpointZodSchema } = await import('./CustomEndpoint');
    const result = CustomEndpointZodSchema.safeParse({
      name: 'Test',
      slug: 'test',
      method: 'GET',
      endpointType: 'script',
      envVars: { API_KEY: 'secret', BASE_URL: 'https://example.com' },
    });
    expect(result.success).toBe(true);
  });
});
