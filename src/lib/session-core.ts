import { SignJWT, jwtVerify, importJWK } from 'jose';
import { createLogger } from './logger';

const logger = createLogger('session-core');

function getSecretKey() {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    logger.warn('WARNING: JWT_SECRET is not set. Using insecure development fallback.');
  }
  // HS256 requires exactly 32 bytes (256 bits).
  const secret = (secretKey || 'dev_fallback_secret_32_chars_now').slice(0, 32);
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: Record<string, unknown>) {
  const rawKey = getSecretKey();
  const key = await importJWK(
    {
      kty: 'oct',
      k: Buffer.from(rawKey).toString('base64url'),
      alg: 'HS256',
    },
    'HS256'
  );

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(key);
}

export async function decrypt(input: string) {
  const rawKey = getSecretKey();
  const key = await importJWK(
    {
      kty: 'oct',
      k: Buffer.from(rawKey).toString('base64url'),
      alg: 'HS256',
    },
    'HS256'
  );

  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload;
}
