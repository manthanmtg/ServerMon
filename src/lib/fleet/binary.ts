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

export async function verifyChecksum(
  filePath: string,
  expectedSha256: string,
  readFile: (p: string) => Promise<Buffer> = async (p) => fs.promises.readFile(p)
): Promise<boolean> {
  const buf = await readFile(filePath);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  return digest === expectedSha256.toLowerCase();
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

export async function ensureBinary(
  opts: EnsureBinaryOpts
): Promise<{ frps: string; frpc: string }> {
  const {
    cacheDir,
    version,
    fetchImpl = fetch,
    spawnImpl = realSpawn,
    fsImpl = {
      existsSync: fs.existsSync,
      mkdirSync: (p: string, o?: { recursive: boolean }) => fs.mkdirSync(p, o) as unknown as void,
      writeFile: (p: string, data: Buffer) => fs.promises.writeFile(p, data),
    },
  } = opts;

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
