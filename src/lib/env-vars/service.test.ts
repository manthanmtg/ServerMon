/** @vitest-environment node */
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSystemInstruction,
  deleteFromShellEnvFile,
  isSecretEnvKey,
  isValidEnvKey,
  parseShellEnvFile,
  quoteShellValue,
  upsertShellEnvFile,
} from './service';

const tempDirs: string[] = [];

async function tempFile(content = '') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'servermon-env-vars-'));
  tempDirs.push(dir);
  const file = path.join(dir, '.zshenv');
  await writeFile(file, content, 'utf8');
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('env vars service helpers', () => {
  it('validates portable environment variable names', () => {
    expect(isValidEnvKey('OPENAI_API_KEY')).toBe(true);
    expect(isValidEnvKey('_PRIVATE_TOKEN')).toBe(true);
    expect(isValidEnvKey('1_BAD')).toBe(false);
    expect(isValidEnvKey('BAD-NAME')).toBe(false);
    expect(isValidEnvKey('')).toBe(false);
  });

  it('detects secret-looking variable names', () => {
    expect(isSecretEnvKey('OPENAI_API_KEY')).toBe(true);
    expect(isSecretEnvKey('DATABASE_PASSWORD')).toBe(true);
    expect(isSecretEnvKey('PUBLIC_URL')).toBe(false);
  });

  it('quotes shell values safely', () => {
    expect(quoteShellValue('plain')).toBe("'plain'");
    expect(quoteShellValue("can't leak $TOKEN")).toBe("'can'\"'\"'t leak $TOKEN'");
  });

  it('parses simple export and assignment lines from shell env files', async () => {
    const file = await tempFile(
      [
        '# comment',
        'export OPENAI_API_KEY="sk-test"',
        "PLAIN='hello world'",
        'COMPLEX=$(security find-generic-password -w -s token)',
        '',
      ].join('\n')
    );

    const parsed = await parseShellEnvFile(file);

    expect(parsed.variables).toEqual([
      {
        key: 'OPENAI_API_KEY',
        value: 'sk-test',
        source: file,
        scope: 'user',
        writable: true,
        sensitive: true,
        inCurrentSession: false,
      },
      {
        key: 'PLAIN',
        value: 'hello world',
        source: file,
        scope: 'user',
        writable: true,
        sensitive: false,
        inCurrentSession: false,
      },
    ]);
    expect(parsed.skipped).toEqual([
      {
        key: 'COMPLEX',
        source: file,
        reason: 'Complex shell expression cannot be edited safely.',
      },
    ]);
  });

  it('adds and replaces simple shell env lines without changing unrelated content', async () => {
    const file = await tempFile('# keep me\nexport OLD_VALUE=1\n');

    await upsertShellEnvFile(file, 'OPENAI_API_KEY', 'sk-test');
    await upsertShellEnvFile(file, 'OLD_VALUE', '2');

    await expect(readFile(file, 'utf8')).resolves.toBe(
      "# keep me\nexport OLD_VALUE='2'\nexport OPENAI_API_KEY='sk-test'\n"
    );
  });

  it('deletes simple shell env lines and leaves other keys intact', async () => {
    const file = await tempFile("export OPENAI_API_KEY='sk-test'\nOTHER=value\n");

    await deleteFromShellEnvFile(file, 'OPENAI_API_KEY');

    await expect(readFile(file, 'utf8')).resolves.toBe('OTHER=value\n');
  });

  it('builds system-scope instructions instead of applying privileged changes', () => {
    const linux = buildSystemInstruction({
      platform: 'linux',
      action: 'add',
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
    });
    const windows = buildSystemInstruction({
      platform: 'win32',
      action: 'delete',
      key: 'OPENAI_API_KEY',
    });

    expect(linux.command).toContain('/etc/environment');
    expect(linux.requiresAdmin).toBe(true);
    expect(windows.command).toContain('Machine');
    expect(windows.command).toContain('$null');
  });
});
