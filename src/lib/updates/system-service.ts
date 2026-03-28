import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import { existsSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readdir, readFile, stat, unlink, writeFile, mkdir } from 'node:fs/promises';
import { UpdateRunStatus } from '@/types/updates';

const execFileAsync = promisify(execFile);
const log = createLogger('system-update-service');
const MAX_OUTPUT_BYTES = 128 * 1024;

class SystemUpdateService {
  private static instance: SystemUpdateService;
  private UPDATE_LOG_DIR = process.env.UPDATE_LOG_DIR || '/var/log/servermon_update';
  private MAX_TRACKED_RUNS = 50;
  private LOG_PREFIX = 'servermon_update_';
  private systemdRunAvailable: boolean | null = null;
  private activeRuns = new Map<
    string,
    UpdateRunStatus & { logFile: string; metadataFile: string }
  >();

  private constructor() {
    if (process.env.SERVERMON_BUILDING !== '1') {
      this.checkSystemdRun().catch(() => {});
    }
  }

  public static getInstance(): SystemUpdateService {
    if (!SystemUpdateService.instance) {
      SystemUpdateService.instance = new SystemUpdateService();
    }
    return SystemUpdateService.instance;
  }

  private async checkSystemdRun(): Promise<boolean> {
    if (this.systemdRunAvailable !== null) return this.systemdRunAvailable;
    try {
      await execFileAsync('systemd-run', ['--version'], { timeout: 3000 });
      this.systemdRunAvailable = true;
      log.info('systemd-run available');
    } catch {
      this.systemdRunAvailable = false;
      log.info('systemd-run not available');
    }
    return this.systemdRunAvailable;
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureLogDir(): Promise<string> {
    try {
      if (!existsSync(this.UPDATE_LOG_DIR)) {
        await mkdir(this.UPDATE_LOG_DIR, { recursive: true, mode: 0o755 });
      }
      return this.UPDATE_LOG_DIR;
    } catch (err) {
      log.warn(`Falling back to tmp due to: ${err}`);
      return tmpdir();
    }
  }

  private async pruneOldRuns(logDir: string): Promise<void> {
    try {
      const files = await readdir(logDir);
      const metadataFiles = files.filter(
        (f) => f.startsWith(this.LOG_PREFIX) && f.endsWith('.json')
      );
      if (metadataFiles.length <= this.MAX_TRACKED_RUNS) return;

      const stats = await Promise.all(
        metadataFiles.map(async (f) => {
          const s = await stat(join(logDir, f));
          return { name: f, mtime: s.mtime.getTime() };
        })
      );

      stats.sort((a, b) => a.mtime - b.mtime);
      const toDelete = stats.slice(0, stats.length - this.MAX_TRACKED_RUNS);

      for (const item of toDelete) {
        const base = item.name.replace('.json', '');
        await unlink(join(logDir, `${base}.json`)).catch(() => {});
        await unlink(join(logDir, `${base}.log`)).catch(() => {});
      }
    } catch (err) {
      log.error('Failed to prune old runs', err);
    }
  }

  public async listUpdateRuns(): Promise<UpdateRunStatus[]> {
    const logDir = await this.ensureLogDir();
    try {
      const files = await readdir(logDir);
      const metadataFiles = files.filter(
        (f) => f.startsWith(this.LOG_PREFIX) && f.endsWith('.json')
      );

      const runs = await Promise.all(
        metadataFiles.map(async (f) => {
          try {
            const content = await readFile(join(logDir, f), 'utf-8');
            const metadata = JSON.parse(content) as UpdateRunStatus;

            let changed = false;
            const logFile = `${f.replace('.json', '.log')}`;
            const logPath = join(logDir, logFile);

            if (
              metadata.status === 'running' &&
              metadata.pid > 0 &&
              !this.isProcessRunning(metadata.pid)
            ) {
              metadata.status = 'completed';
              changed = true;
              if (existsSync(logPath)) {
                try {
                  const s = await stat(logPath);
                  metadata.finishedAt = s.mtime.toISOString();
                } catch {
                  metadata.finishedAt = new Date().toISOString();
                }
              } else {
                metadata.finishedAt = new Date().toISOString();
              }
            } else if (
              metadata.status === 'completed' &&
              metadata.finishedAt &&
              existsSync(logPath)
            ) {
              try {
                const s = await stat(logPath);
                const storedFinished = new Date(metadata.finishedAt).getTime();
                const logMtime = s.mtime.getTime();
                if (storedFinished - logMtime > 60000) {
                  metadata.finishedAt = s.mtime.toISOString();
                  changed = true;
                }
              } catch {
                /* ignore */
              }
            }

            if (changed) {
              await writeFile(join(logDir, f), JSON.stringify(metadata, null, 2));
            }

            return metadata;
          } catch {
            return null;
          }
        })
      );

      const runMap = new Map<string, UpdateRunStatus>();
      runs.forEach((r) => {
        if (r) runMap.set(r.runId, r);
      });
      this.activeRuns.forEach((r) => {
        runMap.set(r.runId, {
          runId: r.runId,
          timestamp: r.timestamp,
          status: r.status,
          pid: r.pid,
          exitCode: r.exitCode,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
        });
      });

      return Array.from(runMap.values()).sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
    } catch (err) {
      log.error('Failed to list update runs', err);
      return [];
    }
  }

  public async getUpdateRunDetails(runId: string): Promise<UpdateRunStatus | null> {
    const logDir = await this.ensureLogDir();
    const fullId = runId.startsWith(this.LOG_PREFIX) ? runId : `${this.LOG_PREFIX}${runId}`;
    const metadataPath = join(logDir, `${fullId}.json`);
    const logPath = join(logDir, `${fullId}.log`);

    let run: (UpdateRunStatus & { logFile?: string; metadataFile?: string }) | null = null;
    const active = this.activeRuns.get(runId);

    if (active) {
      run = active;
    } else {
      try {
        if (!existsSync(metadataPath)) return null;
        const content = await readFile(metadataPath, 'utf-8');
        run = JSON.parse(content) as UpdateRunStatus;
      } catch (_err) {
        log.error(`Failed to read metadata for ${runId}`, _err);
        return null;
      }
    }

    if (!run) return null;

    let changed = false;
    if (run.status === 'running' && run.pid > 0 && !this.isProcessRunning(run.pid)) {
      run.status = 'completed';
      changed = true;
      if (existsSync(logPath)) {
        try {
          const s = await stat(logPath);
          run.finishedAt = s.mtime.toISOString();
        } catch {
          run.finishedAt = new Date().toISOString();
        }
      } else {
        run.finishedAt = new Date().toISOString();
      }
    } else if (run.status === 'completed' && run.finishedAt && existsSync(logPath)) {
      try {
        const s = await stat(logPath);
        const storedFinished = new Date(run.finishedAt).getTime();
        const logMtime = s.mtime.getTime();
        if (storedFinished - logMtime > 60000) {
          run.finishedAt = s.mtime.toISOString();
          changed = true;
        }
      } catch {
        /* ignore */
      }
    }

    if (changed) {
      try {
        await writeFile(
          metadataPath,
          JSON.stringify(
            {
              runId: run.runId,
              timestamp: run.timestamp,
              status: run.status,
              pid: run.pid,
              exitCode: run.exitCode,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
            },
            null,
            2
          )
        );
      } catch {
        /* ignore */
      }
    }

    try {
      if (existsSync(logPath)) {
        let logData = await readFile(logPath, 'utf-8');
        if (logData.length > MAX_OUTPUT_BYTES) {
          logData = logData.slice(0, MAX_OUTPUT_BYTES) + '\n... [truncated]';
        }
        run.logContent = logData;
      }
    } catch (err) {
      log.warn(`Failed to read log for ${runId}`, err);
    }

    return run;
  }

  private async spawnTrackedRun(
    cmd: string,
    args: string[],
    env?: Record<string, string>
  ): Promise<{ success: boolean; pid?: number; message: string; runId?: string }> {
    const logDir = await this.ensureLogDir();
    const runIdBase = String(Date.now());
    const runId = `${this.LOG_PREFIX}${runIdBase}`;
    const timestamp = new Date().toISOString();
    const logFile = join(logDir, `${runId}.log`);
    const metadataFile = join(logDir, `${runId}.json`);

    try {
      const logFd = openSync(logFile, 'w');

      const child = spawn(cmd, args, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, ...env },
      });

      closeSync(logFd);
      child.unref();

      if (child.pid) {
        const run: UpdateRunStatus & { logFile: string; metadataFile: string } = {
          runId: runIdBase,
          timestamp,
          status: 'running',
          pid: child.pid,
          exitCode: null,
          startedAt: timestamp,
          logFile,
          metadataFile,
        };

        const updateMetadata = async () => {
          try {
            await writeFile(
              metadataFile,
              JSON.stringify(
                {
                  runId: run.runId,
                  timestamp: run.timestamp,
                  status: run.status,
                  pid: run.pid,
                  exitCode: run.exitCode,
                  startedAt: run.startedAt,
                  finishedAt: run.finishedAt,
                },
                null,
                2
              )
            );
          } catch (_err) {
            log.error(`Metadata write fail for ${runId}`, _err);
          }
        };

        await updateMetadata();

        child.on('exit', async (code) => {
          run.status = code === 0 ? 'completed' : 'failed';
          run.exitCode = code;
          run.finishedAt = new Date().toISOString();
          await updateMetadata();
        });

        child.on('error', async (_err) => {
          run.status = 'failed';
          run.exitCode = -1;
          run.finishedAt = new Date().toISOString();
          await updateMetadata();
        });

        this.activeRuns.set(runIdBase, run);
        this.pruneOldRuns(logDir);

        return {
          success: true,
          pid: child.pid,
          message: 'Update triggered successfully',
          runId: runIdBase,
        };
      } else {
        throw new Error('Failed to get PID');
      }
    } catch (_err) {
      log.error('Failed to trigger update', _err);
      return { success: false, message: _err instanceof Error ? _err.message : 'Unknown error' };
    }
  }

  public async triggerUpdate(): Promise<{
    success: boolean;
    pid?: number;
    message: string;
    runId?: string;
  }> {
    const scriptBase = process.env.SERVERMON_REPO_DIR || '/opt/servermon/repo';
    const updateScript = `${scriptBase}/scripts/update-servermon.sh`;

    if (!existsSync(updateScript)) {
      return { success: false, message: `Update script not found at ${updateScript}` };
    }

    const useSystemd = await this.checkSystemdRun();
    const spawnCmd = useSystemd ? 'systemd-run' : 'sudo';
    const spawnArgs = useSystemd
      ? ['--scope', '--quiet', '--', 'sudo', updateScript]
      : [updateScript];

    return this.spawnTrackedRun(spawnCmd, spawnArgs);
  }

  public async triggerSystemPackageUpdate(): Promise<{
    success: boolean;
    pid?: number;
    message: string;
    runId?: string;
  }> {
    const upgradeScript =
      'set -e; echo "=== System Package Update ===" ; ' +
      'echo "Refreshing package lists..." ; apt-get update -y ; ' +
      'echo "Installing upgrades..." ; apt-get upgrade -y ; ' +
      'echo "Cleaning up..." ; apt-get autoremove -y ; apt-get autoclean -y ; ' +
      'echo "=== Update Complete ==="';

    const useSystemd = await this.checkSystemdRun();
    const spawnCmd = useSystemd ? 'systemd-run' : 'sudo';
    const spawnArgs = useSystemd
      ? ['--scope', '--quiet', '--', 'sudo', 'bash', '-c', upgradeScript]
      : ['bash', '-c', upgradeScript];

    return this.spawnTrackedRun(spawnCmd, spawnArgs, { DEBIAN_FRONTEND: 'noninteractive' });
  }
}

export const systemUpdateService = SystemUpdateService.getInstance();
