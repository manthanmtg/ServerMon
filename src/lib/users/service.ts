import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@/lib/logger';
import connectDB from '@/lib/db';
import User from '@/models/User';

const execFileAsync = promisify(execFile);
const log = createLogger('users-service');

export interface OSUser {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
  groups: string[];
  hasSudo: boolean;
  sshKeysCount: number;
}

export interface WebUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

class UsersService {
  private static instance: UsersService;

  private constructor() {}

  public static getInstance(): UsersService {
    if (!UsersService.instance) {
      UsersService.instance = new UsersService();
    }
    return UsersService.instance;
  }

  private async runCommand(
    cmd: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 10000 });
      return { stdout, stderr };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      log.warn(`Command failed: ${cmd} ${args.join(' ')}`, err);
      return { stdout: error.stdout || '', stderr: error.stderr || '' };
    }
  }

  // --- OS Users ---

  public async listOSUsers(): Promise<OSUser[]> {
    try {
      const { stdout: passwd } = await this.runCommand('cat', ['/etc/passwd']);
      const lines = passwd.split('\n').filter(Boolean);

      const users: OSUser[] = [];
      for (const line of lines) {
        const [username, , uid, gid, , home, shell] = line.split(':');
        const uidNum = parseInt(uid);

        // Usually filter for human users (UID >= 1000) or specific system users
        if (uidNum >= 1000 || username === 'root') {
          const groups = await this.getUserGroups(username);
          const hasSudo =
            groups.includes('sudo') || groups.includes('wheel') || username === 'root';
          const sshKeysCount = await this.getSSHKeysCount(username, home);

          users.push({
            username,
            uid: uidNum,
            gid: parseInt(gid),
            home,
            shell,
            groups,
            hasSudo,
            sshKeysCount,
          });
        }
      }
      return users;
    } catch (err: unknown) {
      log.error('Failed to list OS users', err);
      return [];
    }
  }

  private async getUserGroups(username: string): Promise<string[]> {
    const { stdout } = await this.runCommand('groups', [username]);
    // Output format: "username : group1 group2 ..."
    return stdout.split(':')[1]?.trim().split(/\s+/) || [];
  }

  private async getSSHKeysCount(username: string, home: string): Promise<number> {
    try {
      const authKeysPath = path.join(home, '.ssh', 'authorized_keys');
      const content = await fs.readFile(authKeysPath, 'utf8').catch(() => '');
      return content.split('\n').filter((line) => line.trim() && !line.startsWith('#')).length;
    } catch (_err: unknown) {
      return 0;
    }
  }

  public async createOSUser(username: string, shell: string = '/bin/bash'): Promise<void> {
    const { stderr } = await this.runCommand('sudo', ['useradd', '-m', '-s', shell, username]);
    if (stderr && !stderr.includes('already exists')) {
      throw new Error(stderr);
    }
  }

  public async deleteOSUser(username: string): Promise<void> {
    const { stderr } = await this.runCommand('sudo', ['userdel', '-r', username]);
    if (stderr) throw new Error(stderr);
  }

  public async toggleSudo(username: string, enable: boolean): Promise<void> {
    // Toggle sudo access
    const groups = await this.getUserGroups(username);
    let newGroups = [];

    if (enable) {
      if (groups.includes('sudo')) return;
      await this.runCommand('sudo', ['usermod', '-aG', 'sudo', username]);
    } else {
      if (!groups.includes('sudo')) return;
      newGroups = groups.filter((g) => g !== 'sudo');
      await this.runCommand('sudo', ['usermod', '-G', newGroups.join(','), username]);
    }
  }

  // --- Web Users (ServerMon Internal) ---

  public async listWebUsers(): Promise<WebUser[]> {
    try {
      await connectDB();
      const docs = await User.find().sort({ createdAt: -1 }).lean();
      return docs.map(
        (d: {
          _id: unknown;
          username: string;
          role: 'admin' | 'user';
          isActive: boolean;
          lastLoginAt?: Date;
          createdAt?: Date;
        }) => ({
          id: String(d._id),
          username: d.username,
          role: d.role,
          isActive: d.isActive,
          lastLoginAt: d.lastLoginAt?.toISOString(),
          createdAt: d.createdAt?.toISOString(),
        })
      );
    } catch (err: unknown) {
      log.error('Failed to list web users', err);
      return [];
    }
  }

  public async deleteWebUser(id: string): Promise<void> {
    try {
      await connectDB();
      await User.findByIdAndDelete(id);
    } catch (err: unknown) {
      log.error('Failed to delete web user', err);
      throw err;
    }
  }

  public async updateWebUserRole(id: string, role: 'admin' | 'user'): Promise<void> {
    try {
      await connectDB();
      await User.findByIdAndUpdate(id, { role });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      log.error(`Failed to update web user ${id}`, { error: errorMessage });
      throw new Error(errorMessage);
    }
  }
}

export const usersService = UsersService.getInstance();
