import { SignJWT, jwtVerify } from 'jose';

function getSecretKey() {
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET environment variable is required in production');
        }
        console.warn('WARNING: JWT_SECRET is not set. Using insecure development fallback.');
    }
    return new TextEncoder().encode(secretKey || 'development_secret_only');
}

export async function encrypt(payload: Record<string, unknown>) {
    const key = getSecretKey();
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(key);
}

export async function decrypt(input: string) {
    const key = getSecretKey();
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    });
    return payload;
}
