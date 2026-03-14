/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
    mockConnectDB,
    mockFindByIdAndUpdate,
    mockFindOne,
    mockUpdateOne,
    mockFindById,
} = vi.hoisted(() => ({
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
    mockFindByIdAndUpdate: vi.fn().mockResolvedValue(null),
    mockFindOne: vi.fn().mockResolvedValue(null),
    mockUpdateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    mockFindById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));

vi.mock('@/models/CustomEndpoint', () => ({
    default: {
        findByIdAndUpdate: mockFindByIdAndUpdate,
        findOne: mockFindOne,
        updateOne: mockUpdateOne,
        findById: mockFindById,
    },
}));

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

import { generateToken, verifyToken, verifyTokenBySlug, revokeToken, listTokens } from './token-service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<{
    _id: mongoose.Types.ObjectId;
    hashedToken: string;
    expiresAt?: Date;
    lastUsedAt?: Date;
    name: string;
    prefix: string;
    createdAt: Date;
}> = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        name: 'test-token',
        hashedToken: 'placeholder',
        prefix: 'sk_abc...',
        createdAt: new Date(),
        lastUsedAt: undefined,
        expiresAt: undefined,
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('token-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockConnectDB.mockResolvedValue(undefined);
        mockFindByIdAndUpdate.mockResolvedValue(null);
        mockFindOne.mockResolvedValue(null);
        mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    });

    // ── generateToken ────────────────────────────────────────────────────────

    describe('generateToken()', () => {
        it('connects to the database', async () => {
            await generateToken('endpoint-id', 'my-token');
            expect(mockConnectDB).toHaveBeenCalledOnce();
        });

        it('returns a rawToken starting with "sk_"', async () => {
            const { rawToken } = await generateToken('endpoint-id', 'my-token');
            expect(rawToken.startsWith('sk_')).toBe(true);
        });

        it('returns a prefix with "..." in the middle', async () => {
            const { prefix } = await generateToken('endpoint-id', 'my-token');
            expect(prefix).toContain('...');
        });

        it('generates unique tokens on repeated calls', async () => {
            const result1 = await generateToken('endpoint-id', 'token-1');
            const result2 = await generateToken('endpoint-id', 'token-2');
            expect(result1.rawToken).not.toBe(result2.rawToken);
        });

        it('calls findByIdAndUpdate with $push to tokens array', async () => {
            await generateToken('endpoint-id', 'my-token');
            expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
                'endpoint-id',
                expect.objectContaining({
                    $push: expect.objectContaining({
                        tokens: expect.objectContaining({
                            name: 'my-token',
                        }),
                    }),
                })
            );
        });

        it('stores a hashed token, not the raw token', async () => {
            const { rawToken } = await generateToken('endpoint-id', 'my-token');

            const pushArg = mockFindByIdAndUpdate.mock.calls[0][1];
            const storedToken = pushArg.$push.tokens;

            // The hashed token must differ from the raw token
            expect(storedToken.hashedToken).not.toBe(rawToken);
            // Should be a SHA-256 hex string (64 chars)
            expect(storedToken.hashedToken).toMatch(/^[0-9a-f]{64}$/);
        });

        it('stores expiresAt when provided', async () => {
            const expiresAt = new Date(Date.now() + 86400_000);
            await generateToken('endpoint-id', 'my-token', expiresAt);

            const pushArg = mockFindByIdAndUpdate.mock.calls[0][1];
            expect(pushArg.$push.tokens.expiresAt).toEqual(expiresAt);
        });

        it('does not set expiresAt when not provided', async () => {
            await generateToken('endpoint-id', 'my-token');

            const pushArg = mockFindByIdAndUpdate.mock.calls[0][1];
            expect(pushArg.$push.tokens.expiresAt).toBeUndefined();
        });
    });

    // ── verifyToken ──────────────────────────────────────────────────────────

    describe('verifyToken()', () => {
        it('returns false when no endpoint is found', async () => {
            mockFindOne.mockResolvedValue(null);
            const result = await verifyToken('endpoint-id', 'sk_sometoken');
            expect(result).toBe(false);
        });

        it('returns true when token matches and is not expired', async () => {
            const rawToken = 'sk_testtoken123';
            const crypto = await import('node:crypto');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

            const token = makeToken({
                hashedToken,
                expiresAt: new Date(Date.now() + 86400_000), // future
            });

            mockFindOne.mockResolvedValue({
                tokens: [token],
                _id: new mongoose.Types.ObjectId(),
            });

            const result = await verifyToken('endpoint-id', rawToken);
            expect(result).toBe(true);
        });

        it('returns false when the token is expired', async () => {
            const rawToken = 'sk_expiredtoken';
            const crypto = await import('node:crypto');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

            const token = makeToken({
                hashedToken,
                expiresAt: new Date(Date.now() - 1000), // past
            });

            mockFindOne.mockResolvedValue({
                tokens: [token],
                _id: new mongoose.Types.ObjectId(),
            });

            const result = await verifyToken('endpoint-id', rawToken);
            expect(result).toBe(false);
        });

        it('returns true when token has no expiry', async () => {
            const rawToken = 'sk_noexpiry';
            const crypto = await import('node:crypto');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

            const token = makeToken({ hashedToken, expiresAt: undefined });

            mockFindOne.mockResolvedValue({
                tokens: [token],
            });

            const result = await verifyToken('endpoint-id', rawToken);
            expect(result).toBe(true);
        });

        it('updates lastUsedAt when token is valid', async () => {
            const rawToken = 'sk_valid';
            const crypto = await import('node:crypto');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
            const tokenId = new mongoose.Types.ObjectId();

            const token = makeToken({ _id: tokenId, hashedToken });

            mockFindOne.mockResolvedValue({ tokens: [token] });

            await verifyToken('endpoint-id', rawToken);

            expect(mockUpdateOne).toHaveBeenCalledWith(
                expect.objectContaining({ _id: 'endpoint-id' }),
                expect.objectContaining({ $set: expect.objectContaining({ 'tokens.$.lastUsedAt': expect.any(Date) }) })
            );
        });
    });

    // ── verifyTokenBySlug ────────────────────────────────────────────────────

    describe('verifyTokenBySlug()', () => {
        it('returns false when no endpoint matches the slug', async () => {
            mockFindOne.mockResolvedValue(null);
            const result = await verifyTokenBySlug('my-endpoint', 'sk_token');
            expect(result).toBe(false);
        });

        it('returns true when token matches by slug and is not expired', async () => {
            const rawToken = 'sk_slugtoken';
            const crypto = await import('node:crypto');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

            const token = makeToken({ hashedToken });
            mockFindOne.mockResolvedValue({ tokens: [token], slug: 'my-endpoint' });

            const result = await verifyTokenBySlug('my-endpoint', rawToken);
            expect(result).toBe(true);
        });

        it('queries by slug field, not by id', async () => {
            await verifyTokenBySlug('my-slug', 'sk_token');

            expect(mockFindOne).toHaveBeenCalledWith(
                expect.objectContaining({ slug: 'my-slug' })
            );
        });
    });

    // ── revokeToken ──────────────────────────────────────────────────────────

    describe('revokeToken()', () => {
        it('calls findByIdAndUpdate with $pull to remove the token', async () => {
            mockFindByIdAndUpdate.mockResolvedValue({ _id: 'endpoint-id' });

            await revokeToken('endpoint-id', 'token-id-1');

            expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
                'endpoint-id',
                expect.objectContaining({
                    $pull: expect.objectContaining({
                        tokens: expect.objectContaining({ _id: 'token-id-1' }),
                    }),
                })
            );
        });

        it('returns true when the endpoint is found', async () => {
            mockFindByIdAndUpdate.mockResolvedValue({ _id: 'endpoint-id' });

            const result = await revokeToken('endpoint-id', 'token-id-1');
            expect(result).toBe(true);
        });

        it('returns false when the endpoint is not found', async () => {
            mockFindByIdAndUpdate.mockResolvedValue(null);

            const result = await revokeToken('endpoint-id', 'token-id-1');
            expect(result).toBe(false);
        });
    });

    // ── listTokens ───────────────────────────────────────────────────────────

    describe('listTokens()', () => {
        it('returns an empty array when the endpoint is not found', async () => {
            mockFindById.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue(null),
                }),
            });

            const tokens = await listTokens('endpoint-id');
            expect(tokens).toEqual([]);
        });

        it('returns mapped token list when endpoint has tokens', async () => {
            const tokenId = new mongoose.Types.ObjectId();
            const now = new Date();

            mockFindById.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({
                        tokens: [
                            {
                                _id: tokenId,
                                name: 'my-key',
                                prefix: 'sk_abc...',
                                createdAt: now,
                                lastUsedAt: undefined,
                                expiresAt: undefined,
                            },
                        ],
                    }),
                }),
            });

            const tokens = await listTokens('endpoint-id');

            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toMatchObject({
                _id: String(tokenId),
                name: 'my-key',
                prefix: 'sk_abc...',
                createdAt: now,
            });
        });

        it('does not expose hashedToken in the returned list', async () => {
            const tokenId = new mongoose.Types.ObjectId();

            mockFindById.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({
                        tokens: [
                            {
                                _id: tokenId,
                                name: 'secret',
                                hashedToken: 'abc123',
                                prefix: 'sk_ab...',
                                createdAt: new Date(),
                            },
                        ],
                    }),
                }),
            });

            const tokens = await listTokens('endpoint-id');
            expect(tokens[0]).not.toHaveProperty('hashedToken');
        });

        it('connects to the DB on each call', async () => {
            mockFindById.mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue(null),
                }),
            });

            await listTokens('endpoint-id');
            expect(mockConnectDB).toHaveBeenCalledOnce();
        });
    });
});
