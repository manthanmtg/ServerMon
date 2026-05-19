/** @vitest-environment node */
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSystemInstruction,
  deleteFromShellEnvFile,
  getSnapshot,
  isSecretEnvKey,
  isValidEnvKey,
  parseEnvCommandOutput,
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

  it('keeps hashes inside quoted values and strips inline comments from bare values', async () => {
    const file = await tempFile(
      [
        'QUOTED_HASH="value # not a comment"',
        "SINGLE_HASH='another # value'",
        'BARE_WITH_COMMENT=value # comment',
        'BARE_HASH=value#literal',
      ].join('\n')
    );

    const parsed = await parseShellEnvFile(file);

    expect(parsed.variables.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'QUOTED_HASH', value: 'value # not a comment' },
      { key: 'SINGLE_HASH', value: 'another # value' },
      { key: 'BARE_WITH_COMMENT', value: 'value' },
      { key: 'BARE_HASH', value: 'value#literal' },
    ]);
    expect(parsed.skipped).toEqual([]);
  });

  it('unescapes double-quoted shell values conservatively', async () => {
    const file = await tempFile(
      [
        'DOUBLE_QUOTE="say \\"hello\\""',
        'DOLLAR_VALUE="cost \\$5"',
        'BACKSLASH_VALUE="C:\\\\tools"',
      ].join('\n')
    );

    const parsed = await parseShellEnvFile(file);

    expect(parsed.variables.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'DOUBLE_QUOTE', value: 'say "hello"' },
      { key: 'DOLLAR_VALUE', value: 'cost $5' },
      { key: 'BACKSLASH_VALUE', value: 'C:\\tools' },
    ]);
  });

  it('unescapes portable single-quote shell sequences', async () => {
    const file = await tempFile(`OWNER='can'"'"'t fail'\n`);

    const parsed = await parseShellEnvFile(file);

    expect(parsed.variables.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'OWNER', value: "can't fail" },
    ]);
  });

  it('skips malformed quoted shell values instead of exposing partial values', async () => {
    const file = await tempFile(
      ['BROKEN_DOUBLE="unterminated', "BROKEN_SINGLE='unterminated", 'SAFE=value'].join('\n')
    );

    const parsed = await parseShellEnvFile(file);

    expect(parsed.variables.map((record) => record.key)).toEqual(['SAFE']);
    expect(parsed.skipped.map((record) => record.key)).toEqual(['BROKEN_DOUBLE', 'BROKEN_SINGLE']);
  });

  it('skips unsafe shell syntax when parsing env files', async () => {
    const file = await tempFile(
      [
        'COMMAND_SUB=$(whoami)',
        'BACKTICK=`whoami`',
        'PIPE=value|other',
        'REDIRECT=value>other',
        'SAFE=value',
      ].join('\n')
    );

    const parsed = await parseShellEnvFile(file);

    expect(parsed.variables.map((record) => record.key)).toEqual(['SAFE']);
    expect(parsed.skipped.map((record) => record.key)).toEqual([
      'COMMAND_SUB',
      'BACKTICK',
      'PIPE',
      'REDIRECT',
    ]);
  });

  it('parses env command output into current session records', () => {
    expect(
      parseEnvCommandOutput('SHELL=/bin/bash\nHOME=/root\nEMPTY=\nBAD LINE\nTOKEN=secret\n')
    ).toEqual([
      {
        key: 'EMPTY',
        value: '',
        scope: 'session',
        source: 'env command',
        writable: false,
        sensitive: false,
        inCurrentSession: true,
      },
      {
        key: 'HOME',
        value: '/root',
        scope: 'session',
        source: 'env command',
        writable: false,
        sensitive: false,
        inCurrentSession: true,
      },
      {
        key: 'SHELL',
        value: '/bin/bash',
        scope: 'session',
        source: 'env command',
        writable: false,
        sensitive: false,
        inCurrentSession: true,
      },
      {
        key: 'TOKEN',
        value: 'secret',
        scope: 'session',
        source: 'env command',
        writable: false,
        sensitive: true,
        inCurrentSession: true,
      },
    ]);
  });

  it('preserves equals signs inside env command values', () => {
    expect(parseEnvCommandOutput('DATABASE_URL=mongodb://user:pass@example/db?x=1&y=2\n')).toEqual([
      {
        key: 'DATABASE_URL',
        value: 'mongodb://user:pass@example/db?x=1&y=2',
        scope: 'session',
        source: 'env command',
        writable: false,
        sensitive: false,
        inCurrentSession: true,
      },
    ]);
  });

  it('uses env command output for the snapshot session list', async () => {
    const file = await tempFile("export PUBLIC_URL='https://example.com'\n");
    const env = {
      HOME: path.dirname(file),
      SHELL: '/bin/zsh',
      SERVERMON_ONLY: 'service-process',
    };

    const snapshot = await getSnapshot({
      env,
      platform: 'linux',
      execEnvCommand: async () => 'HOME=/root\nPATH=/usr/bin\nPUBLIC_URL=https://example.com\n',
    });

    expect(snapshot.session.map((record) => record.key)).toEqual(['HOME', 'PATH', 'PUBLIC_URL']);
    expect(snapshot.session.some((record) => record.key === 'SERVERMON_ONLY')).toBe(false);
    expect(snapshot.persistent[0]?.inCurrentSession).toBe(true);
  });

  it('adds and replaces simple shell env lines without changing unrelated content', async () => {
    const file = await tempFile('# keep me\nexport OLD_VALUE=1\n');

    await upsertShellEnvFile(file, 'OPENAI_API_KEY', 'sk-test');
    await upsertShellEnvFile(file, 'OLD_VALUE', '2');

    await expect(readFile(file, 'utf8')).resolves.toBe(
      "# keep me\nexport OLD_VALUE='2'\nexport OPENAI_API_KEY='sk-test'\n"
    );
  });

  it('creates a missing shell env file when adding a value', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'servermon-env-vars-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'nested', '.profile');

    await upsertShellEnvFile(file, 'NEW_VALUE', 'created');

    await expect(readFile(file, 'utf8')).resolves.toBe("export NEW_VALUE='created'\n");
  });

  it('refuses to replace complex shell env assignments', async () => {
    const file = await tempFile('TOKEN=$(security find-generic-password -w -s token)\n');

    await expect(upsertShellEnvFile(file, 'TOKEN', 'plain')).rejects.toThrow(
      'Cannot safely replace complex assignment for TOKEN.'
    );
    await expect(readFile(file, 'utf8')).resolves.toBe(
      'TOKEN=$(security find-generic-password -w -s token)\n'
    );
  });

  it('deletes simple shell env lines and leaves other keys intact', async () => {
    const file = await tempFile("export OPENAI_API_KEY='sk-test'\nOTHER=value\n");

    await deleteFromShellEnvFile(file, 'OPENAI_API_KEY');

    await expect(readFile(file, 'utf8')).resolves.toBe('OTHER=value\n');
  });

  it('empties the shell env file when deleting its only editable line', async () => {
    const file = await tempFile("export ONLY_VALUE='present'\n");

    await deleteFromShellEnvFile(file, 'ONLY_VALUE');

    await expect(readFile(file, 'utf8')).resolves.toBe('');
  });

  it('refuses to delete complex shell env assignments', async () => {
    const file = await tempFile('TOKEN=$(security find-generic-password -w -s token)\n');

    await expect(deleteFromShellEnvFile(file, 'TOKEN')).rejects.toThrow(
      'Cannot safely delete complex assignment for TOKEN.'
    );
    await expect(readFile(file, 'utf8')).resolves.toBe(
      'TOKEN=$(security find-generic-password -w -s token)\n'
    );
  });

  it('rejects invalid keys before mutating shell env files', async () => {
    const file = await tempFile("SAFE='value'\n");

    await expect(upsertShellEnvFile(file, 'BAD-NAME', 'value')).rejects.toThrow(
      'Environment variable names must start with a letter or underscore'
    );
    await expect(deleteFromShellEnvFile(file, 'BAD-NAME')).rejects.toThrow(
      'Environment variable names must start with a letter or underscore'
    );
    await expect(readFile(file, 'utf8')).resolves.toBe("SAFE='value'\n");
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

  it('escapes platform-specific system instruction values', () => {
    const windows = buildSystemInstruction({
      platform: 'win32',
      action: 'add',
      key: 'OWNER',
      value: "team's value",
    });
    const macos = buildSystemInstruction({
      platform: 'darwin',
      action: 'add',
      key: 'OWNER',
      value: "team's value",
    });

    expect(windows.command).toContain("'team''s value'");
    expect(macos.command).toContain("'team'\"'\"'s value'");
  });
});
