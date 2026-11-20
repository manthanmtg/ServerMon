import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { ScriptEnvironmentVariable } from '@/modules/script-runner/types';
import { environmentInput } from './schemas';

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

export function sealEnvironment(entries: ScriptEnvironmentVariable[]) {
  if (!entries.length) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function openEnvironment(sealed?: string | null): ScriptEnvironmentVariable[] {
  if (!sealed) return [];
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
  return environmentInput.parse(JSON.parse(plaintext));
}
