/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  getNextRunTimeFromExpression,
  resolveInvocationTemplate,
  shellEscape,
  stripAnsi,
} from './service';

describe('ai-runner service helpers', () => {
  it('strips ANSI escape sequences from output', () => {
    expect(stripAnsi('\u001b[32mgreen\u001b[0m')).toBe('green');
  });

  it('escapes shell content safely', () => {
    expect(shellEscape(`it's safe`)).toContain(`'it'"'"'s safe'`);
  });

  it('resolves prompt and working directory placeholders', () => {
    const command = resolveInvocationTemplate(
      'codex --cwd $WORKING_DIR "$PROMPT"',
      'Fix tests',
      '/srv/repo'
    );
    expect(command).toContain('Fix tests');
    expect(command).toContain('/srv/repo');
  });

  it('computes the next run time from a cron expression', () => {
    const next = getNextRunTimeFromExpression('0 9 * * 1-5', new Date('2026-04-20T10:00:00.000Z'));
    expect(next).toBeDefined();
  });
});
