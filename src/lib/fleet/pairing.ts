import crypto from 'node:crypto';
import argon2 from 'argon2';

export function generatePairingToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
export async function hashPairingToken(token: string): Promise<string> {
  return argon2.hash(token, { type: argon2.argon2id });
}
export async function verifyPairingToken(token: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, token);
  } catch {
    return false;
  }
}
