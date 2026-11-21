import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@/lib/logger';
import type { DiskExplorerScan } from '../explorer-types';
import { deleteDiskEntry, isCleanupPath, prepareDiskDeletion } from './cleanup';
import { DiskScanError, scanDisk, type DiskScanNode, type DiskScanTree } from './gdu';

const log = createLogger('disk:explorer');
const SCAN_TTL = 20 * 60 * 1000;
const CONFIRMATION_TTL = 2 * 60 * 1000;
const MAX_SCANS = 2;
const PAGE_SIZE = 100;

export class DiskExplorerError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

interface Confirmation {
  token: string;
  path: string;
  kind: 'file' | 'directory';
  identity: string;
  expiresAt: number;
}

interface ScanJob {
  id: string;
  owner: string;
  rootPath: string;
  expiresAt: number;
  state:
    | { status: 'scanning' }
    | { status: 'failed'; error: string }
    | { status: 'ready'; tree: DiskScanTree };
  confirmation?: Confirmation;
  preparing?: boolean;
}

const globals = globalThis as typeof globalThis & {
  diskExplorer?: { jobs: Map<string, ScanJob>; deleting: boolean };
};
const explorer = (globals.diskExplorer ??= { jobs: new Map(), deleting: false });

function discardExpiredScans() {
  for (const [id, job] of explorer.jobs) {
    if (job.state.status !== 'scanning' && job.expiresAt <= Date.now()) {
      explorer.jobs.delete(id);
    }
  }
}

function getJob(owner: string, id: string) {
  discardExpiredScans();
  const job = explorer.jobs.get(id);
  if (!job || job.owner !== owner) {
    throw new DiskExplorerError('This scan is unavailable. Run a new scan.', 404);
  }
  job.expiresAt = Date.now() + SCAN_TTL;
  return job;
}

async function finishScan(job: ScanJob) {
  try {
    job.state = { status: 'ready', tree: await scanDisk(job.rootPath) };
  } catch (error) {
    if (!(error instanceof DiskScanError)) log.error('Capacity scan failed', error);
    job.state = {
      status: 'failed',
      error: error instanceof DiskScanError ? error.message : 'Could not scan this directory.',
    };
  } finally {
    job.expiresAt = Date.now() + SCAN_TTL;
  }
}

export async function startDiskScan(owner: string, scanPath: string): Promise<DiskExplorerScan> {
  const rootPath = await realpath(scanPath).catch(() => null);
  if (!rootPath || !(await stat(rootPath).catch(() => null))?.isDirectory()) {
    throw new DiskExplorerError('Choose an existing directory ServerMon can access.', 400);
  }
  discardExpiredScans();
  if (
    explorer.deleting ||
    [...explorer.jobs.values()].some((job) => job.state.status === 'scanning')
  ) {
    throw new DiskExplorerError('A disk operation is already running. Try again shortly.', 409);
  }

  if (explorer.jobs.size >= MAX_SCANS) {
    const oldest = [...explorer.jobs.values()].sort((a, b) => a.expiresAt - b.expiresAt)[0];
    explorer.jobs.delete(oldest.id);
  }
  const id = randomUUID();
  const job: ScanJob = {
    id,
    owner,
    rootPath,
    expiresAt: Date.now() + SCAN_TTL,
    state: { status: 'scanning' },
  };
  explorer.jobs.set(id, job);
  void finishScan(job);

  return { id, rootPath, status: 'scanning' };
}

function findNode(rootPath: string, root: DiskScanNode, target: string): DiskScanNode {
  const relative = path.relative(rootPath, target);
  let node: DiskScanNode | undefined = root;
  if (relative) {
    for (const segment of relative.split(path.sep)) {
      node = node?.children?.find((child) => child.name === segment);
      if (!node) break;
    }
  }
  if (!node) throw new DiskExplorerError('This path is outside the scan or was not found.', 404);
  return node;
}

export function browseDiskScan(
  owner: string,
  id: string,
  target: string | undefined,
  offset: number,
  isAdmin: boolean
): DiskExplorerScan {
  const job = getJob(owner, id);
  const reference = { id, rootPath: job.rootPath };
  if (job.state.status !== 'ready') return { ...reference, ...job.state };

  const directory = target ?? job.rootPath;
  const { root, partial } = job.state.tree;
  const node = findNode(job.rootPath, root, directory);
  if (!node.children) throw new DiskExplorerError('Choose a directory to browse.', 400);

  return {
    ...reference,
    status: 'ready',
    listing: {
      path: directory,
      size: node.size,
      partial,
      offset,
      nextOffset: offset + PAGE_SIZE < node.children.length ? offset + PAGE_SIZE : null,
      entries: node.children.slice(offset, offset + PAGE_SIZE).map((child) => {
        const childPath = path.join(directory, child.name);
        return {
          name: child.name,
          path: childPath,
          size: child.size,
          kind: child.children ? 'directory' : 'file',
          readError: child.readError,
          canDelete: isAdmin && !child.readError && !child.special && isCleanupPath(childPath),
        };
      }),
    },
  };
}

export async function requestDiskDeletion(owner: string, id: string, target: string) {
  const job = getJob(owner, id);
  if (job.state.status !== 'ready') {
    throw new DiskExplorerError('Wait for the scan to finish.', 409);
  }
  if (explorer.deleting || job.preparing) {
    throw new DiskExplorerError('A cleanup operation is already in progress.', 409);
  }
  if (target === job.rootPath || !isCleanupPath(target)) {
    throw new DiskExplorerError('This path is outside the configured cleanup directories.', 403);
  }

  const node = findNode(job.rootPath, job.state.tree.root, target);
  if (node.readError) {
    throw new DiskExplorerError('This entry was not fully scanned.', 409);
  }
  if (node.special) {
    throw new DiskExplorerError('Choose a regular file or directory to delete.', 403);
  }

  const kind = node.children ? 'directory' : 'file';
  delete job.confirmation;
  job.preparing = true;
  try {
    const { identity, size, modifiedAt } = await prepareDiskDeletion(target, kind);
    if (explorer.jobs.get(id) !== job || explorer.deleting) {
      throw new DiskExplorerError('The scan changed. Run a new scan before deleting.', 409);
    }
    if (node.modifiedAt !== undefined && node.modifiedAt !== modifiedAt) {
      throw new DiskExplorerError(
        'This entry changed since the scan. Rescan before deleting.',
        409
      );
    }
    const token = randomUUID();
    job.confirmation = {
      token,
      path: target,
      kind,
      identity,
      expiresAt: Date.now() + CONFIRMATION_TTL,
    };
    return { token, size, modifiedAt };
  } finally {
    job.preparing = false;
  }
}

function containsPath(parent: string, target: string): boolean {
  return parent === '/' || target === parent || target.startsWith(parent + path.sep);
}

export async function confirmDiskDeletion(owner: string, id: string, token: string) {
  const job = getJob(owner, id);
  const confirmation = job.confirmation;
  if (job.state.status !== 'ready' || !confirmation || confirmation.token !== token) {
    throw new DiskExplorerError('Open the confirmation dialog again to delete this entry.', 409);
  }
  if (confirmation.expiresAt <= Date.now()) {
    delete job.confirmation;
    throw new DiskExplorerError('The confirmation expired. Open it again to continue.', 409);
  }
  if (
    explorer.deleting ||
    [...explorer.jobs.values()].some((job) => job.state.status === 'scanning')
  ) {
    throw new DiskExplorerError('A disk operation is already running. Try again shortly.', 409);
  }

  explorer.deleting = true;
  for (const [scanId, scan] of explorer.jobs) {
    if (
      containsPath(scan.rootPath, confirmation.path) ||
      containsPath(confirmation.path, scan.rootPath)
    ) {
      explorer.jobs.delete(scanId);
    }
  }
  try {
    await deleteDiskEntry(confirmation.path, confirmation.kind, confirmation.identity);
  } finally {
    explorer.deleting = false;
  }
}
