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
});
