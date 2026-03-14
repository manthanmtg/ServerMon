/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import path from 'path';

// Mock child_process
vi.mock('child_process', () => ({
    execFile: vi.fn(),
}));

// Mock util
vi.mock('util', async (importOriginal) => {
    const original = await importOriginal<typeof import('util')>();
    return {
        ...original,
        promisify: vi.fn((fn) => {
            if (fn === execFile) {
                // Return a function that behaves like the promisified mock
                return async (...args: unknown[]) => {
                    return await new Promise((resolve, reject) => {
                        (execFile as unknown as (...a: unknown[]) => void)(...args, (err: Error | null, out: unknown) => {
                            if (err) reject(err);
                            else resolve(out);
                        });
                    });
                };
            }
            return original.promisify(fn);
        }),
    };
});

// Mock fs/promises
vi.mock('fs', async (importOriginal) => {
    const original = await importOriginal<typeof import('fs')>();
    return {
        ...original,
        promises: {
            access: vi.fn(),
            stat: vi.fn(),
            readdir: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
            mkdir: vi.fn(),
            rename: vi.fn(),
            rm: vi.fn(),
            unlink: vi.fn(),
        },
    };
});

// Mock os
vi.mock('os', () => ({
    default: {
        homedir: vi.fn().mockReturnValue('/home/user'),
    },
    __esModule: true
}));

import { 
    resolveBrowserPath, 
    formatPermissions, 
    formatBytes, 
    listDirectory,
    previewFile
} from './file-browser';

describe('file-browser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Utilities', () => {
        it('should resolve browser paths correctly', () => {
            expect(resolveBrowserPath('~/docs')).toBe(path.resolve('/home/user/docs'));
            expect(resolveBrowserPath('/absolute/path')).toBe('/absolute/path');
        });

        it('should format permissions correctly', () => {
            expect(formatPermissions(0o755)).toBe('rwxr-xr-x');
        });

        it('should format bytes correctly', () => {
            expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
        });
    });

    describe('Git Integration', () => {
        it('should parse git status porcelain correctly', async () => {
            const root = '/home/user/project';
            (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation(
                (...args: unknown[]) => {
                const cb = args.pop() as (err: Error | null, result: { stdout: string }) => void;
                const argsArr = args[1] as string[];
                const argsStr = argsArr.join(' ');

                if (argsStr.includes('rev-parse --show-toplevel')) cb(null, { stdout: root + '\n' });
                else if (argsStr.includes('branch --show-current')) cb(null, { stdout: 'main\n' });
                else if (argsStr.includes('status --porcelain')) {
                    cb(null, { stdout: ' M modified-file.ts\n?? untracked-file.txt\nA  staged-file.js\n' });
                } else if (argsStr.includes('branch -a')) cb(null, { stdout: '* main\n  remotes/origin/main\n' });
                else if (argsStr.includes('rev-list')) cb(null, { stdout: '1\t2\n' });
                else cb(null, { stdout: '' });
            });

            (fs.stat as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
                { isDirectory: () => true, mode: 0o755, mtime: new Date(), size: 0 }
            );
            (fs.readdir as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);

            const result = await listDirectory(root);
            expect(result.git).not.toBeNull();
            expect(result.git?.branch).toBe('main');
            expect(result.git?.staged).toHaveLength(1);
        });
    });

    describe('Preview', () => {
        it('should return preview for text files', async () => {
            (fs.stat as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
                isFile: () => true,
                isDirectory: () => false,
                mode: 0o644,
                mtime: new Date(),
                size: 50
            });
            (fs.access as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(undefined);
            (fs.readFile as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(Buffer.from('Hello World'));

            const result = await previewFile('/home/user/test.txt', 100);
            expect(result.content).toBe('Hello World');
        });
    });
});
