import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    GenerateRegistrationOptionsOpts,
    VerifyRegistrationResponseOpts,
    GenerateAuthenticationOptionsOpts,
    VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';

export const RP_NAME = 'ServerMon';

/**
 * Get the RP ID (domain) from the request host.
 */
export function getRPID(host: string): string {
    return host.split(':')[0];
}

/**
 * Generate options for a user to register a new passkey.
 */
export async function getPasskeyRegistrationOptions(options: GenerateRegistrationOptionsOpts) {
    return await generateRegistrationOptions(options);
}

/**
 * Verify the registration response from the client.
 */
export async function verifyPasskeyRegistration(options: VerifyRegistrationResponseOpts) {
    return await verifyRegistrationResponse(options);
}

/**
 * Generate options for a user to log in with a passkey.
 */
export async function getPasskeyLoginOptions(options: GenerateAuthenticationOptionsOpts) {
    return await generateAuthenticationOptions(options);
}

/**
 * Verify the authentication response from the client.
 */
export async function verifyPasskeyLogin(options: VerifyAuthenticationResponseOpts) {
    return await verifyAuthenticationResponse(options);
}
