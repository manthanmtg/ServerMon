import { spawn as realSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export interface CertificateInfo {
  certPath: string;
  keyPath: string;
  expiresAt: Date;
}

export interface AcmeProvider {
  ensureCertificate(domain: string): Promise<CertificateInfo>;
  renewIfNeeded(
    domain: string,
    thresholdDays?: number
  ): Promise<{ renewed: boolean; expiresAt: Date }>;
  revoke(domain: string): Promise<void>;
}

export interface CertbotProviderOpts {
  spawnImpl?: typeof realSpawn;
  liveDir?: string;
  certbotBinary?: string;
  email?: string;
  nonInteractive?: boolean;
  agreeTos?: boolean;
  installer?: 'standalone' | 'webroot' | 'nginx';
  webrootPath?: string;
  staging?: boolean;
}

interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runSpawn(
  spawnImpl: typeof realSpawn,
  binary: string,
  args: string[]
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const proc = spawnImpl(binary, args) as ChildProcess;
    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

const EXPIRY_DATE_RE =
  /Expiry Date:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?)/;
const NOT_AFTER_RE = /Not After:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?)/;

export function parseCertbotExpiry(output: string): Date | null {
  const m = output.match(EXPIRY_DATE_RE) ?? output.match(NOT_AFTER_RE);
  if (!m) return null;
  let v = m[1];
  // Convert "2026-07-15 12:34:56+00:00" -> "2026-07-15T12:34:56+00:00"
  v = v.replace(' ', 'T');
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

const RENEWAL_MARKERS = ['Congratulations', 'Successfully renewed', 'successfully renewed'];

function hasRenewalMarker(output: string): boolean {
  return RENEWAL_MARKERS.some((m) => output.includes(m));
}

export class CertbotProvider implements AcmeProvider {
  private spawnImpl: typeof realSpawn;
  private liveDir: string;
  private certbotBinary: string;
  private email?: string;
  private nonInteractive: boolean;
  private agreeTos: boolean;
  private installer: 'standalone' | 'webroot' | 'nginx';
  private webrootPath?: string;
  private staging: boolean;

  constructor(opts: CertbotProviderOpts = {}) {
    this.spawnImpl = opts.spawnImpl ?? realSpawn;
    this.liveDir = opts.liveDir ?? '/etc/letsencrypt/live';
    this.certbotBinary = opts.certbotBinary ?? 'certbot';
    this.email = opts.email;
    this.nonInteractive = opts.nonInteractive ?? true;
    this.agreeTos = opts.agreeTos ?? true;
    this.installer = opts.installer ?? (opts.webrootPath ? 'webroot' : 'standalone');
    this.webrootPath = opts.webrootPath;
    this.staging = opts.staging ?? false;
  }

  private pathsFor(domain: string): {
    certPath: string;
    keyPath: string;
  } {
    return {
      certPath: `${this.liveDir}/${domain}/fullchain.pem`,
      keyPath: `${this.liveDir}/${domain}/privkey.pem`,
    };
  }

  private buildCertonlyArgs(domain: string): string[] {
    const args: string[] = this.installer === 'nginx' ? ['--nginx'] : ['certonly'];
    if (this.nonInteractive) args.push('--non-interactive');
    if (this.agreeTos) args.push('--agree-tos');
    if (this.email) args.push('-m', this.email);
    args.push('-d', domain);
    if (this.installer === 'webroot') {
      if (!this.webrootPath) {
        throw new Error('webrootPath is required when installer=webroot');
      }
      args.push('--webroot', '-w', this.webrootPath);
    } else if (this.installer === 'standalone') {
      args.push('--standalone');
    }
    if (this.staging) args.push('--staging');
    return args;
  }

  private async readExpiry(domain: string): Promise<Date> {
    const r = await runSpawn(this.spawnImpl, this.certbotBinary, ['certificates', '-d', domain]);
    if (r.code !== 0) {
      throw new Error(`certbot certificates failed (code ${r.code}): ${r.stderr || r.stdout}`);
    }
    const d = parseCertbotExpiry(r.stdout);
    if (!d) {
      throw new Error(`Could not parse certbot expiry from output: ${r.stdout}`);
    }
    return d;
  }

  async ensureCertificate(domain: string): Promise<CertificateInfo> {
    const args = this.buildCertonlyArgs(domain);
    const r = await runSpawn(this.spawnImpl, this.certbotBinary, args);
    if (r.code !== 0) {
      throw new Error(`certbot certonly failed (code ${r.code}): ${r.stderr || r.stdout}`);
    }
    const expiresAt = await this.readExpiry(domain);
    const { certPath, keyPath } = this.pathsFor(domain);
    return { certPath, keyPath, expiresAt };
  }

  async renewIfNeeded(
    domain: string,
    thresholdDays = 30
  ): Promise<{ renewed: boolean; expiresAt: Date }> {
    const current = await this.readExpiry(domain);
    const msUntilExpiry = current.getTime() - Date.now();
    const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);
    if (daysUntilExpiry > thresholdDays) {
      return { renewed: false, expiresAt: current };
    }
    const r = await runSpawn(this.spawnImpl, this.certbotBinary, [
      'renew',
      '--cert-name',
      domain,
      '--non-interactive',
    ]);
    if (r.code !== 0) {
      throw new Error(`certbot renew failed (code ${r.code}): ${r.stderr || r.stdout}`);
    }
    const renewed = hasRenewalMarker(r.stdout) || hasRenewalMarker(r.stderr);
    const expiresAt = await this.readExpiry(domain);
    return { renewed, expiresAt };
  }

  async revoke(domain: string): Promise<void> {
    const r = await runSpawn(this.spawnImpl, this.certbotBinary, [
      'revoke',
      '--cert-name',
      domain,
      '--non-interactive',
    ]);
    if (r.code !== 0) {
      throw new Error(`certbot revoke failed (code ${r.code}): ${r.stderr || r.stdout}`);
    }
  }
}
