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
});
