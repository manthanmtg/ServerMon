import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, type PathLike } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 120_000;
const EXTRACT_TIMEOUT_MS = 30_000;
const VERSION_CHECK_TIMEOUT_MS = 15_000;
const MANAGED_BINARY_NAME = 'gdu';
const RELEASE_ORIGIN = 'https://github.com/dundee/gdu/releases';
export const GDU_RELEASE_VERSION = '5.39.0';
export const GDU_INSTALL_HELP =
  'Install dundee/gdu v5.39.0 or newer, or set SERVERMON_GDU_PATH to its executable.';

export const GDU_RELEASE_CHECKSUMS: Record<string, string> = {
  'linux/x64': 'b2e519b7c9ef54013d6ab035222ddbb195fa275d8bb160ab5f9f085410fdb647',
  'linux/arm64': '95900a16b9f9dad97f975b667644ddc073a1b377e95a0b4dfdf50045bf556ad0',
  'darwin/x64': 'b3b966daaa18f743f4d25c194fe22b383c5232e437c39e3875712ef9a78115ec',
  'darwin/arm64': '320a43faaa4e57928218292f70941581f334768477f337c641dd01aa8c904ba8',
};

export class DiskScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiskScanError';
  }
}

export interface GduInstallDeps {
  fetchImpl?: typeof fetch;
  checksums?: Record<string, string>;
  platform?: NodeJS.Platform;
  arch?: string;
}

interface GduReleaseAsset {
  archive: string;
  binaryName: string;
  checksumKey: string;
}

function getGduBinDir(): string {
  if (process.env.SERVERMON_GDU_BIN_DIR) return path.resolve(process.env.SERVERMON_GDU_BIN_DIR);
  if (process.platform === 'linux' && process.env.NODE_ENV === 'production') {
    return '/var/lib/servermon/bin';
  }
  return path.join(os.homedir(), '.servermon', 'bin');
}

function releaseAssetFor(deps: GduInstallDeps): GduReleaseAsset | null {
  const platform = deps.platform ?? process.platform;
  const arch = deps.arch ?? process.arch;
  const archTag = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : null;
  if ((platform !== 'linux' && platform !== 'darwin') || !archTag) return null;
  const tag = `${platform}_${archTag}`;
  return {
    archive: `gdu_${tag}.tgz`,
    binaryName: `gdu_${tag}`,
    checksumKey: `${platform}/${arch}`,
  };
}

async function isExecutable(candidate: PathLike): Promise<boolean> {
  return access(candidate, fsConstants.X_OK).then(
    () => true,
    () => false
  );
}

type GduVersion = [major: number, minor: number, patch: number];

const MINIMUM_GDU_VERSION: GduVersion = GDU_RELEASE_VERSION.split('.').map(Number) as GduVersion;

function parseGduVersion(output: string): GduVersion | null {
  const match = /Version:\s*v?(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isAtLeast(version: GduVersion, minimum: GduVersion): boolean {
  for (let index = 0; index < minimum.length; index++) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

// GNU du is installed as `gdu` by Homebrew coreutils, so PATH candidates must
// identify themselves as dundee/gdu at or above the required export version.
const candidateChecks = new Map<string, boolean>();

async function isUsableGdu(candidate: string): Promise<boolean> {
  const cached = candidateChecks.get(candidate);
  if (cached !== undefined) return cached;
  let usable = false;
  try {
    const { stdout } = await execFileAsync(candidate, ['--version'], {
      timeout: VERSION_CHECK_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    const version = parseGduVersion(stdout);
    usable = version !== null && isAtLeast(version, MINIMUM_GDU_VERSION);
  } catch {
    usable = false;
  }
  candidateChecks.set(candidate, usable);
  return usable;
}

async function findGduOnPath(): Promise<string | null> {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, MANAGED_BINARY_NAME);
    if ((await isExecutable(candidate)) && (await isUsableGdu(candidate))) return candidate;
  }
  return null;
}

function autoInstallDisabled(): boolean {
  return ['false', '0', 'no', 'off'].includes(
    (process.env.SERVERMON_GDU_AUTO_INSTALL ?? '').toLowerCase()
  );
}

async function downloadArchive(url: string, deps: GduInstallDeps): Promise<Buffer> {
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch {
    throw new DiskScanError(
      `Could not reach GitHub releases to download gdu ${GDU_RELEASE_VERSION}. ${GDU_INSTALL_HELP}`
    );
  }
  if (!response.ok) {
    throw new DiskScanError(
      `GitHub releases returned ${response.status} for gdu ${GDU_RELEASE_VERSION}. ${GDU_INSTALL_HELP}`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function installGdu(deps: GduInstallDeps = {}): Promise<string> {
  const asset = releaseAssetFor(deps);
  if (!asset) {
    throw new DiskScanError(
      `No prebuilt gdu ${GDU_RELEASE_VERSION} release for this platform. ${GDU_INSTALL_HELP}`
    );
  }
  const expectedChecksum = (deps.checksums ?? GDU_RELEASE_CHECKSUMS)[asset.checksumKey];
  if (!expectedChecksum) {
    throw new DiskScanError(
      `No verified gdu ${GDU_RELEASE_VERSION} release for this platform. ${GDU_INSTALL_HELP}`
    );
  }

  const body = await downloadAssetBody(asset, deps);
  const digest = createHash('sha256').update(body).digest('hex');
  if (digest !== expectedChecksum) {
    throw new DiskScanError(
      `The downloaded gdu release failed checksum verification. ${GDU_INSTALL_HELP}`
    );
  }
  return extractBinary(body, asset);
}

async function downloadAssetBody(asset: GduReleaseAsset, deps: GduInstallDeps): Promise<Buffer> {
  const url = `${RELEASE_ORIGIN}/download/v${GDU_RELEASE_VERSION}/${asset.archive}`;
  const body = await downloadArchive(url, deps);
  if (body.length === 0) {
    throw new DiskScanError(`GitHub releases returned an empty gdu download. ${GDU_INSTALL_HELP}`);
  }
  return body;
}

async function extractBinary(body: Buffer, asset: GduReleaseAsset): Promise<string> {
  const primaryDir = getGduBinDir();
  let binDir = primaryDir;
  try {
    await mkdir(binDir, { recursive: true });
  } catch {
    // Older installs keep /var/lib/servermon root-owned; fall back to the home directory.
    binDir = path.join(os.homedir(), '.servermon', 'bin');
    if (binDir === primaryDir) {
      throw new DiskScanError(
        `Could not create the gdu install directory ${primaryDir}. ${GDU_INSTALL_HELP}`
      );
    }
    await mkdir(binDir, { recursive: true });
  }

  const stagingDir = await mkdtemp(path.join(binDir, '.gdu-install-'));
  try {
    const archivePath = path.join(stagingDir, asset.archive);
    await writeFile(archivePath, body, { mode: 0o600 });
    try {
      await execFileAsync('tar', ['-xzf', archivePath, '-C', stagingDir, asset.binaryName], {
        timeout: EXTRACT_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
    } catch {
      throw new DiskScanError(`Could not unpack the downloaded gdu release. ${GDU_INSTALL_HELP}`);
    }
    const binaryPath = path.join(binDir, MANAGED_BINARY_NAME);
    await chmod(path.join(stagingDir, asset.binaryName), 0o755);
    await rename(path.join(stagingDir, asset.binaryName), binaryPath);
    return binaryPath;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

let installPromise: Promise<string> | null = null;

export async function ensureGduExecutable(deps: GduInstallDeps = {}): Promise<string> {
  const override = process.env.SERVERMON_GDU_PATH;
  if (override) {
    if (await isExecutable(override)) return override;
    throw new DiskScanError(
      `SERVERMON_GDU_PATH points to a missing or non-executable file. ${GDU_INSTALL_HELP}`
    );
  }

  const onPath = await findGduOnPath();
  if (onPath) return onPath;

  const managed = path.join(getGduBinDir(), MANAGED_BINARY_NAME);
  if (await isExecutable(managed)) return managed;

  if (autoInstallDisabled()) {
    throw new DiskScanError(
      `Gdu was not found and automatic installation is disabled. ${GDU_INSTALL_HELP}`
    );
  }

  installPromise ??= installGdu(deps).finally(() => {
    installPromise = null;
  });
  return installPromise;
}
