import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateCommandSecrets, storeCommandSecret } from './commandSecrets';

interface StoredCommandSecretDoc {
  commandId: string;
  nodeId: string;
  iv: string;
  tag: string;
  ciphertext: string;
  expiresAt: Date;
}

describe('commandSecrets', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('stores an encrypted payload without raw secret values', async () => {
    const created: StoredCommandSecretDoc[] = [];
    const model = {
      create: vi.fn(async (doc: StoredCommandSecretDoc) => {
        created.push(doc);
        return doc;
      }),
    };

    await storeCommandSecret(
      {
        commandId: 'cmd-1',
        nodeId: 'node-1',
        payload: { mongoUri: 'mongodb://user:pass@db/servermon' },
        expiresAt: new Date('2026-04-29T00:10:00.000Z'),
      },
      model
    );

    expect(model.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(created[0])).not.toContain('mongodb://user:pass@db/servermon');
    expect(created[0]).toMatchObject({
      commandId: 'cmd-1',
      nodeId: 'node-1',
      expiresAt: new Date('2026-04-29T00:10:00.000Z'),
    });
  });

  it('hydrates install-servermon commands with one-time decrypted payload', async () => {
    let stored: StoredCommandSecretDoc | null = null;
    const model = {
      create: vi.fn(async (doc: StoredCommandSecretDoc) => {
        stored = doc;
        return doc;
      }),
      findOne: vi.fn(() => ({
        lean: vi.fn(async () => stored),
      })),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    };

    await storeCommandSecret(
      {
        commandId: 'cmd-2',
        nodeId: 'node-1',
        payload: { mongoUri: 'mongodb://db/servermon' },
      },
      model
    );

    const hydrated = await hydrateCommandSecrets(
      'node-1',
      [
        {
          id: 'cmd-2',
          command: 'install-servermon',
          args: { port: 8912, skipMongo: true, allowRoot: true, secretRef: 'cmd-2' },
        },
      ],
      model
    );

    expect(hydrated[0]).toEqual({
      id: 'cmd-2',
      command: 'install-servermon',
      args: {
        port: 8912,
        skipMongo: true,
        allowRoot: true,
        mongoUri: 'mongodb://db/servermon',
      },
    });
    expect(model.deleteOne).toHaveBeenCalledWith({ commandId: 'cmd-2', nodeId: 'node-1' });
  });

  it('leaves non-install commands untouched without looking up secrets', async () => {
    const model = {
      create: vi.fn(),
      findOne: vi.fn(() => ({
        lean: vi.fn(),
      })),
      deleteOne: vi.fn(),
    };
    const commands = [
      {
        id: 'cmd-restart',
        command: 'restart-service',
        args: { service: 'servermon' },
      },
    ];

    const hydrated = await hydrateCommandSecrets('node-1', commands, model);

    expect(hydrated).toEqual(commands);
    expect(model.findOne).not.toHaveBeenCalled();
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('uses the command id as the secret reference when args do not provide one', async () => {
    let stored: StoredCommandSecretDoc | null = null;
    const model = {
      create: vi.fn(async (doc: StoredCommandSecretDoc) => {
        stored = doc;
        return doc;
      }),
      findOne: vi.fn(() => ({
        lean: vi.fn(async () => stored),
      })),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    };

    await storeCommandSecret(
      {
        commandId: 'cmd-default-ref',
        nodeId: 'node-1',
        payload: { hubToken: 'secret-token' },
      },
      model
    );

    const hydrated = await hydrateCommandSecrets(
      'node-1',
      [
        {
          id: 'cmd-default-ref',
          command: 'install-servermon',
          args: { allowRoot: false },
        },
      ],
      model
    );

    expect(model.findOne).toHaveBeenCalledWith({ commandId: 'cmd-default-ref', nodeId: 'node-1' });
    expect(hydrated[0]).toEqual({
      id: 'cmd-default-ref',
      command: 'install-servermon',
      args: {
        allowRoot: false,
        hubToken: 'secret-token',
      },
    });
  });

  it('hydrates install commands with non-object args from only the secret payload', async () => {
    let stored: StoredCommandSecretDoc | null = null;
    const model = {
      create: vi.fn(async (doc: StoredCommandSecretDoc) => {
        stored = doc;
        return doc;
      }),
      findOne: vi.fn(() => ({
        lean: vi.fn(async () => stored),
      })),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    };

    await storeCommandSecret(
      {
        commandId: 'cmd-array-args',
        nodeId: 'node-1',
        payload: { mongoUri: 'mongodb://from-secret/servermon' },
      },
      model
    );

    const hydrated = await hydrateCommandSecrets(
      'node-1',
      [
        {
          id: 'cmd-array-args',
          command: 'install-servermon',
          args: ['unexpected'],
        },
      ],
      model
    );

    expect(hydrated[0]).toEqual({
      id: 'cmd-array-args',
      command: 'install-servermon',
      args: {
        mongoUri: 'mongodb://from-secret/servermon',
      },
    });
  });

  it('leaves commands unchanged when lookup or deletion support is unavailable', async () => {
    const commands = [
      {
        id: 'cmd-no-model-support',
        command: 'install-servermon',
        args: { secretRef: 'stored-secret' },
      },
    ];

    await expect(
      hydrateCommandSecrets('node-1', commands, {
        create: vi.fn(),
      })
    ).resolves.toBe(commands);
    await expect(
      hydrateCommandSecrets('node-1', commands, {
        create: vi.fn(),
        findOne: vi.fn(() => ({
          lean: vi.fn(async () => null),
        })),
      })
    ).resolves.toBe(commands);
  });

  it('keeps the command unchanged and preserves the secret when no stored payload exists', async () => {
    const model = {
      create: vi.fn(),
      findOne: vi.fn(() => ({
        lean: vi.fn(async () => null),
      })),
      deleteOne: vi.fn(),
    };
    const command = {
      id: 'cmd-missing-secret',
      command: 'install-servermon',
      args: { port: 8912, secretRef: 'missing-secret' },
    };

    const hydrated = await hydrateCommandSecrets('node-1', [command], model);

    expect(hydrated).toEqual([command]);
    expect(model.deleteOne).not.toHaveBeenCalled();
  });
});
