/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type PreSaveCallback = ((this: Record<string, unknown>) => void) | null;

type MockSchemaConstructor = {
  (definition: unknown, options?: unknown): Record<string, unknown>;
  _getPreSave: () => PreSaveCallback;
  Types: { ObjectId: unknown; Mixed: unknown };
};

// We need a working Schema.pre() to test the pre-save hook.
// Use a minimal mongoose mock that actually invokes the pre-save callback.
vi.mock('mongoose', async () => {
  const modelStore: Record<string, unknown> = {};

  let preSaveCallback: PreSaveCallback = null;

  const mockSchema = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    definition: unknown,
    options?: unknown
  ) {
    this.definition = definition;
    this.options = options;
    this.pre = vi.fn().mockImplementation((_event: string, cb: () => void) => {
      preSaveCallback = cb;
    });
    this.index = vi.fn();
    // Expose for tests
    mockSchema._getPreSave = () => preSaveCallback;
    return this;
  }) as MockSchemaConstructor;

  mockSchema.Types = {
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

async function getSchemaConstructorAsync(): Promise<MockSchemaConstructor> {
  const mongoose = await import('mongoose');
  return mongoose.default.Schema as MockSchemaConstructor;
}

describe('TerminalHistory — pre-save hook', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports default model', async () => {
    const mod = await import('./TerminalHistory');
    expect(mod.default).toBeDefined();
  });

  it('calculates durationMinutes when closedAt is set', async () => {
    // Import the module to register the pre hook
    await import('./TerminalHistory');

    // Access the registered pre-save callback via our mock
    const SchemaConstructor = await getSchemaConstructorAsync();
    const preSave = SchemaConstructor._getPreSave();
    expect(preSave).toBeTruthy();

    const createdAt = new Date('2026-01-01T10:00:00Z');
    const closedAt = new Date('2026-01-01T10:30:00Z'); // 30 minutes later

    const doc: Record<string, unknown> = {
      createdAt,
      closedAt,
      durationMinutes: undefined,
    };

    preSave!.call(doc);

    expect(doc.durationMinutes).toBe(30);
  });

  it('does not set durationMinutes when closedAt is absent', async () => {
    await import('./TerminalHistory');

    const SchemaConstructor = await getSchemaConstructorAsync();
    const preSave = SchemaConstructor._getPreSave();

    const doc: Record<string, unknown> = {
      createdAt: new Date('2026-01-01T10:00:00Z'),
      closedAt: undefined,
      durationMinutes: undefined,
    };

    preSave!.call(doc);

    expect(doc.durationMinutes).toBeUndefined();
  });

  it('rounds durationMinutes correctly for sub-minute durations', async () => {
    await import('./TerminalHistory');

    const SchemaConstructor = await getSchemaConstructorAsync();
    const preSave = SchemaConstructor._getPreSave();

    const createdAt = new Date('2026-01-01T10:00:00Z');
    const closedAt = new Date('2026-01-01T10:00:45Z'); // 45 seconds = rounds to 1 minute

    const doc: Record<string, unknown> = { createdAt, closedAt, durationMinutes: undefined };
    preSave!.call(doc);

    expect(doc.durationMinutes).toBe(1);
  });

  it('rounds durationMinutes down for 29 seconds', async () => {
    await import('./TerminalHistory');

    const SchemaConstructor = await getSchemaConstructorAsync();
    const preSave = SchemaConstructor._getPreSave();

    const createdAt = new Date('2026-01-01T10:00:00Z');
    const closedAt = new Date('2026-01-01T10:00:29Z'); // 29 seconds = rounds to 0 minutes

    const doc: Record<string, unknown> = { createdAt, closedAt, durationMinutes: undefined };
    preSave!.call(doc);

    expect(doc.durationMinutes).toBe(0);
  });

  it('calculates multi-hour duration correctly', async () => {
    await import('./TerminalHistory');

    const SchemaConstructor = await getSchemaConstructorAsync();
    const preSave = SchemaConstructor._getPreSave();

    const createdAt = new Date('2026-01-01T08:00:00Z');
    const closedAt = new Date('2026-01-01T10:30:00Z'); // 2.5 hours = 150 minutes

    const doc: Record<string, unknown> = { createdAt, closedAt, durationMinutes: undefined };
    preSave!.call(doc);

    expect(doc.durationMinutes).toBe(150);
  });
});
