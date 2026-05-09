import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn as realSpawn } from 'node:child_process';

export type PlatformTriple =
  | 'linux_amd64'
  | 'linux_arm64'
  | 'darwin_amd64'
  | 'darwin_arm64'
  | 'windows_amd64'
  | 'windows_arm64';

export function platformTriple(
  p: { platform: NodeJS.Platform; arch: string } = {
    platform: process.platform,
    arch: process.arch,
  }
): PlatformTriple {
  const { platform, arch } = p;
  let os: 'linux' | 'darwin' | 'windows';
  if (platform === 'linux') os = 'linux';
  else if (platform === 'darwin') os = 'darwin';
  else if (platform === 'win32') os = 'windows';
  else throw new Error(`Unsupported platform: ${platform}`);

  let cpu: 'amd64' | 'arm64';
  if (arch === 'x64') cpu = 'amd64';
  else if (arch === 'arm64') cpu = 'arm64';
  else throw new Error(`Unsupported arch: ${arch}`);

  return `${os}_${cpu}` as PlatformTriple;
}

export function frpDownloadUrl(version: string, triple: PlatformTriple): string {
  return `https://github.com/fatedier/frp/releases/download/v${version}/frp_${version}_${triple}.tar.gz`;
}

export interface EnsureBinaryOpts {
  cacheDir: string;
  version: string;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof realSpawn;
  fsImpl?: {
    existsSync: (p: string) => boolean;
    mkdirSync: (p: string, opts?: { recursive: boolean }) => void;
    writeFile: (p: string, data: Buffer) => Promise<void>;
  };
}

let cachedLatestVersion: { version: string; expiresAt: number } | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const GITHUB_LATEST_RELEASE_TIMEOUT_MS = 5000;

interface GitHubLatestReleasePayload {
  tag_name: string;
}

function isGitHubLatestReleasePayload(value: unknown): value is GitHubLatestReleasePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag_name' in value &&
    typeof value.tag_name === 'string'
  );
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException ||
    (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError'))
  );
}

async function fetchLatestRelease(fetchImpl: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_LATEST_RELEASE_TIMEOUT_MS);

  try {
    return await fetchImpl('https://api.github.com/repos/fatedier/frp/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ServerMon-Hub' },
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `GitHub latest release lookup timed out after ${GITHUB_LATEST_RELEASE_TIMEOUT_MS}ms`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveVersion(version: string, fetchImpl = fetch): Promise<string> {
  if (version !== 'latest') {
    return version;
  }

  const now = Date.now();
  if (cachedLatestVersion && cachedLatestVersion.expiresAt > now) {
    return cachedLatestVersion.version;
  }

  try {
    const res = await fetchLatestRelease(fetchImpl);
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data: unknown = await res.json();
    if (!isGitHubLatestReleasePayload(data)) {
      throw new Error('Invalid GitHub latest release payload');
    }
    const latest = data.tag_name.replace(/^v/, '');
    cachedLatestVersion = { version: latest, expiresAt: now + CACHE_TTL_MS };
    return latest;
  } catch (err) {
    console.warn('Failed to fetch latest FRP version, falling back to 0.61.2', err);
    return '0.61.2'; // Fallback
  }
}

export async function ensureBinary(
  opts: EnsureBinaryOpts
): Promise<{ frps: string; frpc: string }> {
  const {
    cacheDir,
    version: versionRaw,
    fetchImpl = fetch,
    spawnImpl = realSpawn,
    fsImpl = {
      existsSync: fs.existsSync,
      mkdirSync: (p, o) => {
        fs.mkdirSync(p, o);
      },
      writeFile: (p: string, data: Buffer) => fs.promises.writeFile(p, data),
    },
  } = opts;

  const version = await resolveVersion(versionRaw, fetchImpl);
  const triple = platformTriple();
  const binDir = path.join(cacheDir, version, triple);
  const frps = path.join(binDir, 'frps');
  const frpc = path.join(binDir, 'frpc');

  if (fsImpl.existsSync(frps) && fsImpl.existsSync(frpc)) {
    return { frps, frpc };
  }

  fsImpl.mkdirSync(binDir, { recursive: true });

  const url = frpDownloadUrl(version, triple);
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Failed to download FRP from ${url}: ${res.status} ${res.statusText}`);
  }
  const ab = await res.arrayBuffer();
  const tarball = Buffer.from(ab);

  const tarballPath = path.join(cacheDir, version, `frp_${version}_${triple}.tar.gz`);
  await fsImpl.writeFile(tarballPath, tarball);

  await new Promise<void>((resolve, reject) => {
    const proc = spawnImpl('tar', ['-xzf', tarballPath, '-C', binDir, '--strip-components=1']);
    proc.on('error', reject);
    proc.on('exit', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
  });

  return { frps, frpc };
}
