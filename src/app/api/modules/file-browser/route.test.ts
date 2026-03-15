/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockListDirectory,
  mockReadTree,
  mockCreateEntry,
  mockRenameEntry,
  mockDeleteEntry,
  mockResolveBrowserPath,
} = vi.hoisted(() => ({
  mockListDirectory: vi.fn(),
  mockReadTree: vi.fn(),
  mockCreateEntry: vi.fn(),
  mockRenameEntry: vi.fn(),
  mockDeleteEntry: vi.fn(),
  mockResolveBrowserPath: vi.fn((p: string) => p),
}));

vi.mock('@/modules/file-browser/lib/file-browser', () => ({
  listDirectory: mockListDirectory,
  readTree: mockReadTree,
  createEntry: mockCreateEntry,
  renameEntry: mockRenameEntry,
  deleteEntry: mockDeleteEntry,
  resolveBrowserPath: mockResolveBrowserPath,
  FileBrowserError: class FileBrowserError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST, PATCH, DELETE } from './route';

const mockListing = {
  path: '/home/user',
  entries: [
    { name: 'file.txt', kind: 'file', size: 100 },
    { name: 'subdir', kind: 'directory', size: 0 },
  ],
  git: null,
};

describe('GET /api/modules/file-browser (list mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBrowserPath.mockImplementation((p: string) => p);
  });

  it('returns directory listing by default', async () => {
    mockListDirectory.mockResolvedValue(mockListing);
    const req = new NextRequest('http://localhost/api/modules/file-browser?path=/home/user');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.listing.entries).toHaveLength(2);
  });

  it('returns tree when mode=tree', async () => {
    const tree = { name: 'user', kind: 'directory', children: [] };
    mockReadTree.mockResolvedValue(tree);
    const req = new NextRequest(
      'http://localhost/api/modules/file-browser?path=/home/user&mode=tree'
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tree).toBeDefined();
    expect(mockReadTree).toHaveBeenCalledWith('/home/user', 2);
  });

  it('clamps tree depth to 4', async () => {
    const tree = { name: 'user', kind: 'directory', children: [] };
    mockReadTree.mockResolvedValue(tree);
    const req = new NextRequest(
      'http://localhost/api/modules/file-browser?path=/&mode=tree&depth=99'
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockReadTree).toHaveBeenCalledWith('/', 4);
  });

  it('returns 500 on service error', async () => {
    mockListDirectory.mockRejectedValue(new Error('ENOENT'));
    const req = new NextRequest('http://localhost/api/modules/file-browser?path=/nonexistent');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('POST /api/modules/file-browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBrowserPath.mockImplementation((p: string) => p);
  });

  it('creates a file and returns 201', async () => {
    mockCreateEntry.mockResolvedValue('/home/user/new.txt');
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentPath: '/home/user',
        name: 'new.txt',
        kind: 'file',
        content: 'hello',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.path).toBe('/home/user/new.txt');
  });

  it('creates a directory', async () => {
    mockCreateEntry.mockResolvedValue('/home/user/newdir');
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: '/home/user', name: 'newdir', kind: 'directory' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('returns 500 on validation error', async () => {
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: '' }), // invalid
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('returns FileBrowserError status on known errors', async () => {
    const { FileBrowserError } = await import('@/modules/file-browser/lib/file-browser');
    mockCreateEntry.mockRejectedValue(new FileBrowserError('Already exists', 409));
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: '/home/user', name: 'existing.txt', kind: 'file' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Already exists');
  });
});

describe('PATCH /api/modules/file-browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBrowserPath.mockImplementation((p: string) => p);
  });

  it('renames entry successfully', async () => {
    mockRenameEntry.mockResolvedValue('/home/user/renamed.txt');
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/home/user/old.txt', name: 'renamed.txt' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe('/home/user/renamed.txt');
  });

  it('returns 500 on service error', async () => {
    mockRenameEntry.mockRejectedValue(new Error('rename failed'));
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/home/user/old.txt', name: 'new.txt' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/modules/file-browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBrowserPath.mockImplementation((p: string) => p);
  });

  it('deletes entry successfully', async () => {
    mockDeleteEntry.mockResolvedValue(undefined);
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/home/user/old.txt' }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 500 on service error', async () => {
    mockDeleteEntry.mockRejectedValue(new Error('EACCES'));
    const req = new NextRequest('http://localhost/api/modules/file-browser', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/home/user/file.txt' }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(500);
  });
});
