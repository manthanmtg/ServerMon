/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockUserSave, mockFindOne } = vi.hoisted(() => ({
    mockUserSave: vi.fn().mockResolvedValue(undefined),
    mockFindOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/models/User', () => ({
    default: { findOne: mockFindOne },
}));

vi.mock('@/lib/auth-utils', () => ({
    verifyPassword: vi.fn(),
    verifyTOTPToken: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
    login: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
            status: init?.status ?? 200,
            json: async () => body,
        })),
    },
}));

import { POST, GET } from './route';
import { verifyPassword, verifyTOTPToken } from '@/lib/auth-utils';
import { login } from '@/lib/session';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => 'user-id-123' },
    username: 'admin',
    passwordHash: '$argon2id$hashed',
    role: 'admin',
    totpEnabled: false,
    totpSecret: undefined,
    lastLoginAt: null,
    save: mockUserSave,
    ...overrides,
});

const makeRequest = (body: Record<string, unknown>) =>
    new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });

describe('POST /api/auth/login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUserSave.mockResolvedValue(undefined);
    });

    it('returns 200 on valid credentials without TOTP', async () => {
        mockFindOne.mockResolvedValue(makeUser());
        vi.mocked(verifyPassword).mockResolvedValue(true);

        const req = makeRequest({ username: 'admin', password: 'secret' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(login).toHaveBeenCalledWith({
            id: 'user-id-123',
            username: 'admin',
            role: 'admin',
        });
        expect(mockUserSave).toHaveBeenCalledOnce();
    });

    it('returns 401 when user is not found', async () => {
        mockFindOne.mockResolvedValue(null);

        const req = makeRequest({ username: 'unknown', password: 'x' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('Invalid credentials');
        expect(login).not.toHaveBeenCalled();
    });

    it('returns 401 when password is wrong', async () => {
        mockFindOne.mockResolvedValue(makeUser());
        vi.mocked(verifyPassword).mockResolvedValue(false);

        const req = makeRequest({ username: 'admin', password: 'wrong' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('Invalid credentials');
        expect(login).not.toHaveBeenCalled();
    });

    it('returns 401 when TOTP is enabled but token is invalid', async () => {
        mockFindOne.mockResolvedValue(
            makeUser({ totpEnabled: true, totpSecret: 'TOTP_SECRET' })
        );
        vi.mocked(verifyPassword).mockResolvedValue(true);
        vi.mocked(verifyTOTPToken).mockReturnValue(false);

        const req = makeRequest({ username: 'admin', password: 'secret', totpToken: '000000' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('Invalid verification code');
        expect(login).not.toHaveBeenCalled();
    });

    it('returns 200 when TOTP is enabled and token is valid', async () => {
        mockFindOne.mockResolvedValue(
            makeUser({ totpEnabled: true, totpSecret: 'TOTP_SECRET' })
        );
        vi.mocked(verifyPassword).mockResolvedValue(true);
        vi.mocked(verifyTOTPToken).mockReturnValue(true);

        const req = makeRequest({ username: 'admin', password: 'secret', totpToken: '123456' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(verifyTOTPToken).toHaveBeenCalledWith('123456', 'TOTP_SECRET');
    });

    it('skips TOTP check when totpEnabled is false even if secret exists', async () => {
        mockFindOne.mockResolvedValue(
            makeUser({ totpEnabled: false, totpSecret: 'TOTP_SECRET' })
        );
        vi.mocked(verifyPassword).mockResolvedValue(true);

        const req = makeRequest({ username: 'admin', password: 'secret' });
        await POST(req as never);

        expect(verifyTOTPToken).not.toHaveBeenCalled();
    });

    it('updates lastLoginAt on successful login', async () => {
        const user = makeUser();
        mockFindOne.mockResolvedValue(user);
        vi.mocked(verifyPassword).mockResolvedValue(true);

        const req = makeRequest({ username: 'admin', password: 'secret' });
        await POST(req as never);

        expect(user.lastLoginAt).toBeInstanceOf(Date);
        expect(mockUserSave).toHaveBeenCalledOnce();
    });

    it('returns 500 on unexpected errors', async () => {
        mockFindOne.mockRejectedValue(new Error('Connection lost'));

        const req = makeRequest({ username: 'admin', password: 'secret' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe('Connection lost');
    });
});

describe('GET /api/auth/login', () => {
    it('returns 405 Method Not Allowed', async () => {
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(405);
        expect(body.error).toBeDefined();
    });
});
