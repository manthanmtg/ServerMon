import crypto from 'crypto';
import connectDB from '@/lib/db';
import CustomEndpoint from '@/models/CustomEndpoint';
import { createLogger } from '@/lib/logger';

const log = createLogger('endpoints:token');

const TOKEN_PREFIX = 'sk_';
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export async function generateToken(
    endpointId: string,
    name: string,
    expiresAt?: Date
): Promise<{ rawToken: string; prefix: string }> {
    await connectDB();

    const rawBytes = crypto.randomBytes(TOKEN_BYTES);
    const rawToken = TOKEN_PREFIX + rawBytes.toString('base64url');
    const prefix = rawToken.slice(0, 7) + '...' + rawToken.slice(-4);
    const hashedToken = hashToken(rawToken);

    await CustomEndpoint.findByIdAndUpdate(endpointId, {
        $push: {
            tokens: {
                name,
                hashedToken,
                prefix,
                expiresAt: expiresAt || undefined,
            },
        },
    });

    log.info(`Token "${name}" generated for endpoint ${endpointId}`);

    return { rawToken, prefix };
}

export async function verifyToken(
    endpointId: string,
    rawToken: string
): Promise<boolean> {
    await connectDB();

    const hashedToken = hashToken(rawToken);

    const endpoint = await CustomEndpoint.findOne({
        _id: endpointId,
        'tokens.hashedToken': hashedToken,
    });

    if (!endpoint) return false;

    const token = endpoint.tokens.find((t) => t.hashedToken === hashedToken);
    if (!token) return false;

    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
        return false;
    }

    await CustomEndpoint.updateOne(
        { _id: endpointId, 'tokens._id': token._id },
        { $set: { 'tokens.$.lastUsedAt': new Date() } }
    );

    return true;
}

export async function verifyTokenBySlug(
    slug: string,
    rawToken: string
): Promise<boolean> {
    await connectDB();

    const hashedToken = hashToken(rawToken);

    const endpoint = await CustomEndpoint.findOne({
        slug,
        'tokens.hashedToken': hashedToken,
    });

    if (!endpoint) return false;

    const token = endpoint.tokens.find((t) => t.hashedToken === hashedToken);
    if (!token) return false;

    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
        return false;
    }

    await CustomEndpoint.updateOne(
        { slug, 'tokens._id': token._id },
        { $set: { 'tokens.$.lastUsedAt': new Date() } }
    );

    return true;
}

export async function revokeToken(
    endpointId: string,
    tokenId: string
): Promise<boolean> {
    await connectDB();

    const result = await CustomEndpoint.findByIdAndUpdate(endpointId, {
        $pull: { tokens: { _id: tokenId } },
    });

    if (result) {
        log.info(`Token ${tokenId} revoked for endpoint ${endpointId}`);
    }

    return !!result;
}

export async function listTokens(endpointId: string) {
    await connectDB();

    const endpoint = await CustomEndpoint.findById(endpointId).select('tokens').lean();
    if (!endpoint) return [];

    return endpoint.tokens.map((t) => ({
        _id: String(t._id),
        name: t.name,
        prefix: t.prefix,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
    }));
}
