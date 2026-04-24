import path from 'node:path';
import fs from 'node:fs';
import { nginxTest, nginxReload } from './nginxProcess';

export interface NginxOrchestratorLogEntry {
  level: 'info' | 'warn' | 'error';
  service: 'nginx';
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NginxStateLike {
  managedDir?: string;
  managedServerNames?: string[];
}

export interface NginxOrchestratorDeps {
  NginxState: {
    findOne: (filter: Record<string, unknown>) => {
      lean: () => Promise<NginxStateLike | null> | NginxStateLike | null;
    };
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => Promise<unknown> | unknown;
  };
  FleetLogEvent: {
    create: (doc: Record<string, unknown>) => Promise<unknown> | unknown;
  };
  nginxTestImpl?: typeof nginxTest;
  nginxReloadImpl?: typeof nginxReload;
  writeFile?: (p: string, data: string) => Promise<void>;
  unlink?: (p: string) => Promise<void>;
  mkdir?: (p: string, opts?: { recursive: boolean }) => Promise<void>;
  logEntry?: (entry: NginxOrchestratorLogEntry) => Promise<void> | void;
  now?: () => Date;
}

const SLUG_RE = /^[a-z0-9-]+$/;

function validateSlug(slug: string): void {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug: ${slug}. Allowed chars: [a-z0-9-]`);
  }
}

function isEnoent(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT');
}

export class NginxOrchestrator {
  private readonly deps: NginxOrchestratorDeps;
  private readonly writeFile: (p: string, data: string) => Promise<void>;
  private readonly unlink: (p: string) => Promise<void>;
  private readonly mkdir: (p: string, opts?: { recursive: boolean }) => Promise<void>;
  private readonly nginxTestImpl: typeof nginxTest;
  private readonly nginxReloadImpl: typeof nginxReload;
  private readonly now: () => Date;

  constructor(deps: NginxOrchestratorDeps) {
    this.deps = deps;
    this.writeFile = deps.writeFile ?? ((p, data) => fs.promises.writeFile(p, data, 'utf8'));
    this.unlink = deps.unlink ?? ((p) => fs.promises.unlink(p));
    this.mkdir =
      deps.mkdir ??
      (async (p, opts) => {
        await fs.promises.mkdir(p, opts);
      });
    this.nginxTestImpl = deps.nginxTestImpl ?? nginxTest;
    this.nginxReloadImpl = deps.nginxReloadImpl ?? nginxReload;
    this.now = deps.now ?? (() => new Date());
  }

  async writeSnippet(slug: string, content: string): Promise<string> {
    validateSlug(slug);
    const state = await this.deps.NginxState.findOne({ key: 'global' }).lean();
    const managedDir = state?.managedDir;
    if (!managedDir) {
      throw new Error('nginx managedDir is not configured in NginxState');
    }
    await this.mkdir(managedDir, { recursive: true });
    const abs = path.join(managedDir, `${slug}.conf`);
    await this.writeFile(abs, content);
    return abs;
  }

  async removeSnippet(slug: string): Promise<void> {
    validateSlug(slug);
    const state = await this.deps.NginxState.findOne({ key: 'global' }).lean();
    const managedDir = state?.managedDir;
    if (!managedDir) {
      throw new Error('nginx managedDir is not configured in NginxState');
    }
    const abs = path.join(managedDir, `${slug}.conf`);
    try {
      await this.unlink(abs);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
  }

  async applyAndReload(): Promise<{ ok: boolean; stderr: string }> {
    const testRes = await this.nginxTestImpl();
    const at = this.now();
    if (!testRes.ok) {
      await this.updateState({
        lastTestAt: at,
        lastTestOutput: testRes.stderr,
        lastTestSuccess: false,
      });
      await this.emitLog('warn', 'nginx.test.failed', 'nginx -t failed', {
        stderr: testRes.stderr,
      });
      return { ok: false, stderr: testRes.stderr };
    }

    const reloadRes = await this.nginxReloadImpl();
    const reloadedAt = this.now();
    await this.updateState({
      lastTestAt: at,
      lastTestSuccess: true,
      lastTestOutput: testRes.stderr,
      lastReloadAt: reloadedAt,
      lastReloadSuccess: reloadRes.ok,
    });
    if (!reloadRes.ok) {
      await this.emitLog('warn', 'nginx.reload.failed', 'nginx -s reload failed', {
        stderr: reloadRes.stderr,
      });
      return { ok: false, stderr: reloadRes.stderr };
    }
    await this.emitLog('info', 'nginx.reload', 'nginx reloaded', {});
    return { ok: true, stderr: reloadRes.stderr };
  }

  async listManagedSnippets(): Promise<string[]> {
    const state = await this.deps.NginxState.findOne({ key: 'global' }).lean();
    return state?.managedServerNames ?? [];
  }

  private async updateState(fields: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.NginxState.findOneAndUpdate({ key: 'global' }, { $set: fields });
    } catch {
      // swallow persistence errors
    }
  }

  private async emitLog(
    level: 'info' | 'warn' | 'error',
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const entry: NginxOrchestratorLogEntry = {
      level,
      service: 'nginx',
      eventType,
      message,
      metadata,
    };
    try {
      if (this.deps.logEntry) {
        await this.deps.logEntry(entry);
      } else {
        await this.deps.FleetLogEvent.create({
          service: 'nginx',
          level,
          eventType,
          message,
          metadata,
          audit: eventType === 'nginx.reload',
        });
      }
    } catch {
      // swallow logging errors
    }
  }
}
