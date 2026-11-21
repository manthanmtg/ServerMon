/** @vitest-environment node */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { session, activeAdmin, scanDisk, prepareDiskDeletion, deleteDiskEntry } = vi.hoisted(() => ({
  session: vi.fn(),
  activeAdmin: vi.fn(),
  scanDisk: vi.fn(),
  prepareDiskDeletion: vi.fn(),
  deleteDiskEntry: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: session }));
vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/User', () => ({ default: { exists: activeAdmin } }));
vi.mock('@/modules/disk/lib/gdu', () => ({ DiskScanError: class extends Error {}, scanDisk }));
vi.mock('@/modules/disk/lib/cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/disk/lib/cleanup')>()),
  prepareDiskDeletion,
  deleteDiskEntry,
}));

import { DELETE, GET, POST } from './route';

const url = 'http://localhost/api/modules/disk/explorer';
const admin = { user: { id: '507f1f77bcf86cd799439011', role: 'admin' } };
const viewer = { user: { id: admin.user.id, role: 'user' } };
let root: string;
let cleanup: string;
let file: string;

function mutate(method: 'POST' | 'DELETE', body: object) {
  return new Request(url, { method, body: JSON.stringify(body) });
}

function browse(id: string, directory?: string) {
  const params = new URLSearchParams({ id });
  if (directory) params.set('directory', directory);
  return GET(new Request(url + '?' + params));
}

async function startScan() {
  const response = await POST(mutate('POST', { action: 'scan', path: root }));
  expect(response.status).toBe(202);
  const state = await response.json();
  expect(state.status).toBe('scanning');
  return String(state.id);
}

async function prepare(id: string, target: string) {
  return POST(mutate('POST', { action: 'prepare-delete', id, path: target }));
}

describe('disk explorer API', () => {
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'servermon-explorer-test-')));
    cleanup = path.join(root, 'cleanup');
    file = path.join(cleanup, 'file.txt');
    vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', JSON.stringify([cleanup]));
    session.mockResolvedValue(admin);
    activeAdmin.mockResolvedValue({ _id: admin.user.id });
    scanDisk.mockResolvedValue({
      root: {
        name: root,
        size: 2048,
        readError: false,
        children: [
          {
            name: 'cleanup',
            size: 2048,
            readError: false,
            children: [{ name: 'file.txt', size: 2048, readError: false, modifiedAt: 100 }],
          },
        ],
      },
      partial: false,
    });
    prepareDiskDeletion.mockResolvedValue({ identity: 'live-inode', size: 2048, modifiedAt: 100 });
    deleteDiskEntry.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it('requires an authenticated actor', async () => {
    session.mockResolvedValue(null);
    expect((await POST(mutate('POST', { action: 'scan', path: root }))).status).toBe(401);
    expect(scanDisk).not.toHaveBeenCalled();
  });

  it('browses a shared scan tree without rescanning and restricts it to its owner', async () => {
    const id = await startScan();
    const initial = await (await browse(id)).json();
    expect(initial.listing.entries).toMatchObject([{ path: cleanup, canDelete: false }]);

    const child = await (await browse(id, cleanup)).json();
    expect(child.listing.entries).toMatchObject([{ path: file, canDelete: true }]);
    expect(scanDisk).toHaveBeenCalledTimes(1);
    expect((await browse(id, path.dirname(root))).status).toBe(404);

    session.mockResolvedValue({ user: { id: '507f1f77bcf86cd799439012', role: 'admin' } });
    expect((await browse(id)).status).toBe(404);
    expect((await prepare(id, file)).status).toBe(404);
  });

  it('rejects a changed file and rechecks current administrator status before removing', async () => {
    const id = await startScan();
    prepareDiskDeletion.mockResolvedValueOnce({
      identity: 'replacement',
      size: 4096,
      modifiedAt: 101,
    });
    expect((await prepare(id, file)).status).toBe(409);

    const reply = await prepare(id, file);
    const body = { id, token: (await reply.json()).token };
    activeAdmin.mockResolvedValue(null);
    expect((await DELETE(mutate('DELETE', body))).status).toBe(403);
    expect(deleteDiskEntry).not.toHaveBeenCalled();
  });

  it('requires an administrator and configured child, then consumes confirmation once', async () => {
    const id = await startScan();
    session.mockResolvedValue(viewer);
    const listing = await (await browse(id, cleanup)).json();
    expect(listing.listing.entries[0].canDelete).toBe(false);
    expect((await prepare(id, file)).status).toBe(403);

    session.mockResolvedValue(admin);
    expect((await prepare(id, cleanup)).status).toBe(403);
    expect((await prepare(id, path.join(cleanup, 'unscanned.txt'))).status).toBe(404);
    const reply = await prepare(id, file);
    expect(reply.status).toBe(200);
    expect(prepareDiskDeletion).toHaveBeenCalledWith(file, 'file');
    expect(deleteDiskEntry).not.toHaveBeenCalled();

    const body = { id, token: (await reply.json()).token };
    expect((await DELETE(mutate('DELETE', body))).status).toBe(200);
    expect(deleteDiskEntry).toHaveBeenCalledWith(file, 'file', 'live-inode');
    expect((await DELETE(mutate('DELETE', body))).status).toBe(404);
    expect((await browse(id)).status).toBe(404);
  });

  it('retains a different account’s scan outside the deleted subtree', async () => {
    const id = await startScan();
    const otherRoot = path.join(root, 'other');
    await mkdir(otherRoot);
    const otherAccount = { user: { id: '507f1f77bcf86cd799439012', role: 'user' } };
    session.mockResolvedValue(otherAccount);
    const other = await POST(mutate('POST', { action: 'scan', path: otherRoot }));
    expect(other.status).toBe(202);
    const otherId = (await other.json()).id;

    session.mockResolvedValue(admin);
    const confirmation = await prepare(id, file);
    const body = { id, token: (await confirmation.json()).token };
    expect((await DELETE(mutate('DELETE', body))).status).toBe(200);

    session.mockResolvedValue(otherAccount);
    expect((await browse(otherId)).status).toBe(200);
  });

  it('exposes pending scans and prevents concurrent scans of the same host', async () => {
    let release = () => {};
    scanDisk.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              root: { name: root, size: 0, children: [], readError: false },
              partial: false,
            });
        })
    );
    const id = await startScan();
    try {
      expect((await (await browse(id)).json()).status).toBe('scanning');
      expect((await POST(mutate('POST', { action: 'scan', path: root }))).status).toBe(409);
    } finally {
      release();
    }
    expect((await (await browse(id)).json()).status).toBe('ready');
  });
});
