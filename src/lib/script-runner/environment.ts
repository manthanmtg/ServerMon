import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { ScriptEnvironmentVariable } from '@/modules/script-runner/types';
import { environmentInput, variableValueInput } from './schemas';

export class EnvironmentKeyError extends Error {
  constructor() {
    super(
      'Configure JWT_SECRET on the web service and script worker to use environment variables.'
    );
  }
}

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new EnvironmentKeyError();
  return createHash('sha256')
    .update('servermon/script-runner/environment/v1\0')
    .update(secret)
    .digest();
}

function seal(payload: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

function open(sealed: string): unknown {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported Script Runner environment record.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

export function sealEnvironment(entries: ScriptEnvironmentVariable[]) {
  return entries.length ? seal(entries) : null;
}

export function openEnvironment(sealed?: string | null): ScriptEnvironmentVariable[] {
  return sealed ? environmentInput.parse(open(sealed)) : [];
}

export function sealVariable(value: string) {
  return seal(value);
}

export function openVariable(sealed: string) {
  return variableValueInput.parse(open(sealed));
}

export function combineLaunchEnvironment(
  linked: ScriptEnvironmentVariable[],
  editable: ScriptEnvironmentVariable[]
) {
  const overrides = new Set(editable.map(({ key }) => key));
  const values = new Map(linked.map((entry) => [entry.key, entry]));
  const linkedEnvKeys = [...values.keys()].filter((key) => !overrides.has(key));
  for (const entry of editable) values.set(entry.key, entry);
  return { env: environmentInput.parse([...values.values()]), linkedEnvKeys };
}

export function partitionRunEnvironment(
  env: ScriptEnvironmentVariable[],
  linkedEnvKeys: string[] = []
) {
  const names = new Set(linkedEnvKeys);
  return {
    editable: env.filter(({ key }) => !names.has(key)),
    linked: env.filter(({ key }) => names.has(key)),
  };
}
