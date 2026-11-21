import path from 'node:path';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import type { NginxConfigTest } from '@/modules/nginx/types';
import { nginxService } from './service';
import { validateManagedFileName } from './renderer';

export interface ManagedConfigInput {
  fileName: string;
  content: string;
}

export interface ManagedConfigResult {
  ok: boolean;
  path: string;
  output: string;
}

export interface ManagedConfigDeps {
  managedDir?: string;
  mkdir?: (path: string, opts: { recursive: boolean }) => Promise<unknown>;
  readFile?: (path: string, encoding: 'utf-8') => Promise<string>;
  writeFile?: (path: string, content: string, encoding: 'utf-8') => Promise<unknown>;
  unlink?: (path: string) => Promise<unknown>;
  testConfig?: () => Promise<NginxConfigTest>;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: string }).code === 'ENOENT'
  );
}

function managedPath(managedDir: string, fileName: string): string {
  const safeName = validateManagedFileName(fileName);
  const resolvedDir = path.resolve(managedDir);
  const resolvedPath = path.resolve(resolvedDir, safeName);
  if (!resolvedPath.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error('Managed config path escapes managed directory');
  }
  return resolvedPath;
}

function getDefaultManagedDir(): string {
  return process.env.NGINX_MANAGED_DIR || '/etc/nginx/servermon';
}

export async function writeManagedConfig(
  input: ManagedConfigInput,
  deps: ManagedConfigDeps = {}
): Promise<ManagedConfigResult> {
  const managedDir = deps.managedDir ?? getDefaultManagedDir();
  const mkdirImpl = deps.mkdir ?? mkdir;
  const readFileImpl = deps.readFile ?? readFile;
  const writeFileImpl = deps.writeFile ?? writeFile;
  const testConfigImpl = deps.testConfig ?? nginxService.testConfig;
  const targetPath = managedPath(managedDir, input.fileName);

  await mkdirImpl(managedDir, { recursive: true });

  let previousContent: string | null = null;
  try {
    previousContent = await readFileImpl(targetPath, 'utf-8');
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  await writeFileImpl(targetPath, input.content, 'utf-8');
  const test = await testConfigImpl();
  if (test.success) {
    return { ok: true, path: targetPath, output: test.output };
  }

  if (previousContent !== null) {
    await writeFileImpl(targetPath, previousContent, 'utf-8');
  } else {
    const unlinkImpl = deps.unlink ?? unlink;
    await unlinkImpl(targetPath).catch(() => undefined);
  }

  return { ok: false, path: targetPath, output: test.output };
}

export async function deleteManagedConfig(
  fileName: string,
  deps: ManagedConfigDeps = {}
): Promise<ManagedConfigResult> {
  const managedDir = deps.managedDir ?? getDefaultManagedDir();
  const readFileImpl = deps.readFile ?? readFile;
  const writeFileImpl = deps.writeFile ?? writeFile;
  const unlinkImpl = deps.unlink ?? unlink;
  const testConfigImpl = deps.testConfig ?? nginxService.testConfig;
  const targetPath = managedPath(managedDir, fileName);
  const previousContent = await readFileImpl(targetPath, 'utf-8');

  await unlinkImpl(targetPath);
  const test = await testConfigImpl();
  if (test.success) {
    return { ok: true, path: targetPath, output: test.output };
  }

  await writeFileImpl(targetPath, previousContent, 'utf-8');
  return { ok: false, path: targetPath, output: test.output };
}
