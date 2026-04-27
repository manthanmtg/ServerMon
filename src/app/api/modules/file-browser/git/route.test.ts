/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGitStage,
  mockGitUnstage,
  mockGitStageAll,
  mockGitUnstageAll,
  mockGitDiscardFile,
  mockGitDiscardAll,
  mockGitCheckout,
  mockGitFetch,
  mockGitCommit,
  mockGitPull,
} = vi.hoisted(() => ({
  mockGitStage: vi.fn(),
  mockGitUnstage: vi.fn(),
  mockGitStageAll: vi.fn(),
  mockGitUnstageAll: vi.fn(),
  mockGitDiscardFile: vi.fn(),
  mockGitDiscardAll: vi.fn(),
  mockGitCheckout: vi.fn(),
  mockGitFetch: vi.fn(),
  mockGitPull: vi.fn(),
  mockGitCommit: vi.fn(),
}));

vi.mock('@/modules/file-browser/lib/file-browser', () => ({
  gitStage: mockGitStage,
  gitUnstage: mockGitUnstage,
  gitStageAll: mockGitStageAll,
  gitUnstageAll: mockGitUnstageAll,
  gitDiscardFile: mockGitDiscardFile,
  gitDiscardAll: mockGitDiscardAll,
  gitCheckout: mockGitCheckout,
  gitFetch: mockGitFetch,
  gitCommit: mockGitCommit,
  gitPull: mockGitPull,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { username: 'testuser' } }),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/modules/file-browser/git', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/modules/file-browser/git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stages a file', async () => {
    mockGitStage.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ root: '/repo', action: 'stage', path: 'src/file.ts' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result).toContain('src/file.ts');
  });

  it('returns 400 when stage path is missing', async () => {
    const res = await POST(makeRequest({ root: '/repo', action: 'stage' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('path required');
  });

  it('unstages a file', async () => {
    mockGitUnstage.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ root: '/repo', action: 'unstage', path: 'src/file.ts' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toContain('src/file.ts');
  });

  it('returns 400 when unstage path is missing', async () => {
    const res = await POST(makeRequest({ root: '/repo', action: 'unstage' }));
    expect(res.status).toBe(400);
  });

  it('stages all changes', async () => {
    mockGitStageAll.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ root: '/repo', action: 'stage-all' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe('Staged all changes');
  });

  it('unstages all changes', async () => {
    mockGitUnstageAll.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ root: '/repo', action: 'unstage-all' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe('Unstaged all changes');
  });

  it('discards a file', async () => {
    mockGitDiscardFile.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ root: '/repo', action: 'discard', path: 'src/file.ts' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toContain('src/file.ts');
  });

  it('returns 400 when discard path is missing', async () => {
    const res = await POST(makeRequest({ root: '/repo', action: 'discard' }));
    expect(res.status).toBe(400);
  });

  it('discards all changes', async () => {
    mockGitDiscardAll.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ root: '/repo', action: 'discard-all' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe('Discarded all changes');
  });

  it('checks out a branch', async () => {
    mockGitCheckout.mockResolvedValue(undefined);
    const res = await POST(
      makeRequest({ root: '/repo', action: 'checkout', branch: 'feature/foo' })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toContain('feature/foo');
  });

  it('returns 400 when checkout branch is missing', async () => {
    const res = await POST(makeRequest({ root: '/repo', action: 'checkout' }));
    expect(res.status).toBe(400);
  });

  it('fetches remote', async () => {
    mockGitFetch.mockResolvedValue('Fetched origin');
    const res = await POST(makeRequest({ root: '/repo', action: 'fetch' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe('Fetched origin');
  });

  it('commits with message', async () => {
    mockGitCommit.mockResolvedValue('[main abc123] My commit');
    const res = await POST(makeRequest({ root: '/repo', action: 'commit', message: 'My commit' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toContain('My commit');
  });

  it('returns 400 when commit message is missing', async () => {
    const res = await POST(makeRequest({ root: '/repo', action: 'commit' }));
    expect(res.status).toBe(400);
  });

  it('pulls from remote', async () => {
    mockGitPull.mockResolvedValue('Already up to date.');
    const res = await POST(makeRequest({ root: '/repo', action: 'pull' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe('Already up to date.');
  });

  it('returns 500 on unexpected error', async () => {
    mockGitStageAll.mockRejectedValue(new Error('not a git repo'));
    const res = await POST(makeRequest({ root: '/repo', action: 'stage-all' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('not a git repo');
  });

  it('returns 500 on invalid action (zod parse error)', async () => {
    const res = await POST(makeRequest({ root: '/repo', action: 'invalid-action' }));
    expect(res.status).toBe(500);
  });
});
