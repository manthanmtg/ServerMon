import argon2 from 'argon2';
import { generateSecret, generateURI, verifySync } from 'otplib';
import qrcode from 'qrcode';

/**
 * Hash a password using Argon2.
 */
export async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
}

/**
 * Verify a password against a hash using Argon2.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
        return await argon2.verify(hash, password);
    } catch (err) {
        return false;
    }
}

/**
 * Generate a new TOTP secret for a user.
 */
export function generateTOTPSecret(): string {
    return generateSecret();
}

/**
 * Generate a QR code URL for TOTP enrollment.
 */
export async function generateQRCode(username: string, secret: string): Promise<string> {
    const otpauth = generateURI({
        issuer: 'ServerMon',
        label: username,
        secret: secret,
    });
    return qrcode.toDataURL(otpauth);
}

/**
 * Verify a TOTP token against a secret.
 */
export function verifyTOTPToken(token: string, secret: string): boolean {
    const result = verifySync({ token, secret });
    return result.valid;
}
