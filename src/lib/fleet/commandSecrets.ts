import crypto from 'node:crypto';
import FleetCommandSecret from '@/models/FleetCommandSecret';

interface StoredCommandSecret {
  commandId: string;
  nodeId: string;
  iv: string;
  tag: string;
  ciphertext: string;
  expiresAt: Date;
}

interface CommandSecretModel {
  create(doc: StoredCommandSecret): Promise<unknown>;
  findOne?(filter: { commandId: string; nodeId: string }): {
    lean: () => Promise<StoredCommandSecret | null>;
  };
  deleteOne?(filter: { commandId: string; nodeId: string }): Promise<unknown>;
}

interface PendingCommand {
  id: string;
  command: string;
  args?: unknown;
}

function secretBase(): string {
  return (
    process.env.FLEET_COMMAND_SECRET_KEY ||
    process.env.JWT_SECRET ||
    process.env.FLEET_HUB_AUTH_TOKEN ||
    'servermon-command-secret-development-key'
  );
}

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(secretBase()).digest();
}

function encryptPayload(
  payload: Record<string, unknown>
): Pick<StoredCommandSecret, 'iv' | 'tag' | 'ciphertext'> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function decryptPayload(doc: StoredCommandSecret): Record<string, unknown> {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(doc.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(doc.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(doc.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(decrypted) as Record<string, unknown>;
}

function asArgsObject(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' && !Array.isArray(args)
    ? { ...(args as Record<string, unknown>) }
    : {};
}

export async function storeCommandSecret(
  input: {
    commandId: string;
    nodeId: string;
    payload: Record<string, unknown>;
    expiresAt?: Date;
  },
  model: Pick<CommandSecretModel, 'create'> = FleetCommandSecret
): Promise<void> {
  const encrypted = encryptPayload(input.payload);
  await model.create({
    commandId: input.commandId,
    nodeId: input.nodeId,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
    ...encrypted,
  });
}

export async function hydrateCommandSecrets(
  nodeId: string,
  commands: PendingCommand[],
  model: CommandSecretModel = FleetCommandSecret
): Promise<PendingCommand[]> {
  if (!model.findOne || !model.deleteOne) return commands;

  const hydrated: PendingCommand[] = [];
  for (const command of commands) {
    if (command.command !== 'install-servermon') {
      hydrated.push(command);
      continue;
    }

    const args = asArgsObject(command.args);
    const secretRef = typeof args.secretRef === 'string' ? args.secretRef : command.id;
    const found = await model.findOne({ commandId: secretRef, nodeId }).lean();
    if (!found) {
      hydrated.push(command);
      continue;
    }

    const secretPayload = decryptPayload(found);
    const { secretRef: _secretRef, ...publicArgs } = args;
    hydrated.push({
      ...command,
      args: {
        ...publicArgs,
        ...secretPayload,
      },
    });
    await model.deleteOne({ commandId: secretRef, nodeId });
  }
  return hydrated;
}
