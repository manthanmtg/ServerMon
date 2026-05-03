import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import type { NginxVirtualHost } from '@/modules/nginx/types';
import { parseNginxServerBlocks } from './parser';

const execFileAsync = promisify(execFile);
const log = createLogger('nginx:discovery');

const FALLBACK_DIRS = [
  '/etc/nginx/sites-available',
  '/etc/nginx/sites-enabled',
  '/etc/nginx/conf.d',
  '/etc/nginx/servermon',
];

interface NginxDumpSection {
  sourcePath: string;
  content: string;
}

async function runNginxDump(): Promise<string> {
  const { stdout, stderr } = await execFileAsync('nginx', ['-T'], {
    timeout: 10000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return `${stdout}\n${stderr}`.trim();
}

export function splitNginxDumpBySource(raw: string): NginxDumpSection[] {
  const sections: NginxDumpSection[] = [];
  let currentPath = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentPath || currentLines.length === 0) return;
    sections.push({ sourcePath: currentPath, content: currentLines.join('\n') });
  };

  for (const line of raw.split('\n')) {
    const marker = line.match(/^# configuration file (.+):\s*$/);
    if (marker) {
      flush();
      currentPath = marker[1];
      currentLines = [];
      continue;
    }
    if (currentPath) currentLines.push(line);
  }
  flush();

  return sections;
}

function withLoadedState(vhosts: NginxVirtualHost[], loaded: boolean): NginxVirtualHost[] {
  return vhosts.map((vhost) => ({
    ...vhost,
    loaded,
    enabled: loaded || vhost.enabled,
  }));
}

async function discoverFromDump(): Promise<NginxVirtualHost[]> {
  const dump = await runNginxDump();
  return splitNginxDumpBySource(dump).flatMap((section) =>
    withLoadedState(parseNginxServerBlocks(section.content, section.sourcePath), true)
  );
}

function shouldReadConfigFile(file: string): boolean {
  if (file.startsWith('.')) return false;
  return file.endsWith('.conf') || !file.includes('.');
}

async function discoverFromFallbackDirs(): Promise<NginxVirtualHost[]> {
  const configuredDir = process.env.NGINX_MANAGED_DIR;
  const dirs = configuredDir ? [...FALLBACK_DIRS, configuredDir] : FALLBACK_DIRS;
  const vhosts: NginxVirtualHost[] = [];

  for (const dir of Array.from(new Set(dirs))) {
    let files: string[];
    try {
      files = (await readdir(dir)).filter(shouldReadConfigFile);
    } catch {
      continue;
    }

    for (const file of files) {
      const sourcePath = `${dir}/${file}`;
      try {
        const content = await readFile(sourcePath, 'utf-8');
        vhosts.push(...withLoadedState(parseNginxServerBlocks(content, sourcePath), false));
      } catch (error) {
        log.warn(`Skipping unreadable nginx config: ${sourcePath}`, error);
      }
    }
  }

  return vhosts;
}

function dedupeVhosts(vhosts: NginxVirtualHost[]): NginxVirtualHost[] {
  const seen = new Set<string>();
  const out: NginxVirtualHost[] = [];
  for (const vhost of vhosts) {
    const key = vhost.loaded
      ? (vhost.id ?? `${vhost.sourcePath ?? vhost.filename}::${vhost.raw}`)
      : `${vhost.serverNames.join(' ')}::${vhost.listenPorts.join(' ')}::${vhost.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(vhost);
  }
  return out;
}

export async function discoverNginxVirtualHosts(): Promise<NginxVirtualHost[]> {
  try {
    const loaded = await discoverFromDump();
    if (loaded.length > 0) return dedupeVhosts(loaded);
  } catch (error) {
    log.warn('nginx -T discovery failed; falling back to filesystem scan', error);
  }

  return dedupeVhosts(await discoverFromFallbackDirs());
}
