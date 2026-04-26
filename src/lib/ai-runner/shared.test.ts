/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_CONCURRENT_RUNS,
  MAX_CONCURRENT_RUNS_CAP,
  getMaxConcurrentRuns,
  mapRun,
  stringifyId,
  toIso,
  mapProfile,
  mapPrompt,
  mapSchedule,
  stripAnsi,
  shellEscape,
  resolveInvocationTemplate,
  appendOutput,
  createEmptyBuffers,
  applyOutputChunk,
  shouldRetryJob,
  getNextRunTimeFromExpression,
  validateProfileTemplate,
  ensureDirectoryExists,
  resolvePromptContent,
} from './shared';

describe('ai-runner shared utilities', () => {
  describe('getMaxConcurrentRuns', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns the default when the env var is unset', () => {
      delete process.env.AI_RUNNER_MAX_CONCURRENT_RUNS;
      expect(getMaxConcurrentRuns()).toBe(DEFAULT_MAX_CONCURRENT_RUNS);
    });

    it('uses the configured value when it is valid', () => {
      vi.stubEnv('AI_RUNNER_MAX_CONCURRENT_RUNS', '1');
      expect(getMaxConcurrentRuns()).toBe(1);
    });

    it('clamps invalid low values to 1', () => {
      vi.stubEnv('AI_RUNNER_MAX_CONCURRENT_RUNS', '0');
      expect(getMaxConcurrentRuns()).toBe(1);
    });

    it('caps high values to the supported maximum', () => {
      vi.stubEnv('AI_RUNNER_MAX_CONCURRENT_RUNS', '99');
      expect(getMaxConcurrentRuns()).toBe(MAX_CONCURRENT_RUNS_CAP);
    });
  });

  describe('stringifyId', () => {
    it('returns empty string for null/undefined', () => {
      expect(stringifyId(null)).toBe('');
      expect(stringifyId(undefined)).toBe('');
    });

    it('returns string as is', () => {
      expect(stringifyId('abc')).toBe('abc');
    });

    it('calls toString if available', () => {
      const obj = { toString: () => 'custom' };
      expect(stringifyId(obj)).toBe('custom');
    });

    it('falls back to String()', () => {
      expect(stringifyId(123)).toBe('123');
    });
  });

  describe('toIso', () => {
    it('returns undefined for falsy values', () => {
      expect(toIso(null)).toBeUndefined();
      expect(toIso(undefined)).toBeUndefined();
    });

    it('converts Date to ISO string', () => {
      const d = new Date('2026-04-22T10:00:00Z');
      expect(toIso(d)).toBe('2026-04-22T10:00:00.000Z');
    });
  });

  describe('mapProfile', () => {
    it('correctly maps profile document', () => {
      const now = new Date();
      const doc: Parameters<typeof mapProfile>[0] = {
        _id: 'p1',
        name: 'Profile 1',
        slug: 'p1-slug',
        agentType: 'codex',
        invocationTemplate: 'node index.js',
        defaultTimeout: 10,
        maxTimeout: 20,
        shell: '/bin/bash',
        requiresTTY: true,
        env: new Map([['KEY', 'VALUE']]),
        enabled: true,
        icon: 'my-icon',
        createdAt: now,
        updatedAt: now,
      };
      const result = mapProfile(doc);
      expect(result._id).toBe('p1');
      expect(result.env).toEqual({ KEY: 'VALUE' });
      expect(result.icon).toBe('my-icon');
      expect(result.createdAt).toBe(now.toISOString());
    });
  });

  describe('mapPrompt', () => {
    it('correctly maps prompt document', () => {
      const now = new Date();
      const doc: Parameters<typeof mapPrompt>[0] = {
        _id: 'pr1',
        name: 'Prompt 1',
        content: 'Hello world',
        type: 'inline',
        tags: ['test'],
        createdAt: now,
        updatedAt: now,
      };
      const result = mapPrompt(doc);
      expect(result.name).toBe('Prompt 1');
      expect(result.tags).toEqual(['test']);
    });
  });

  describe('mapSchedule', () => {
    it('correctly maps schedule document', () => {
      const now = new Date();
      const doc: Parameters<typeof mapSchedule>[0] = {
        _id: 's1',
        name: 'Schedule 1',
        promptId: 'pr1',
        agentProfileId: 'ap1',
        cronExpression: '* * * * *',
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      const result = mapSchedule(doc);
      expect(result.promptId).toBe('pr1');
      expect(result.cronExpression).toBe('* * * * *');
    });
  });

  describe('mapRun', () => {
    it('falls back queuedAt from startedAt for legacy runs', () => {
      const startedAt = new Date('2026-04-22T08:00:00.000Z');
      const runDoc: Parameters<typeof mapRun>[0] = {
        _id: 'run-1',
        agentProfileId: 'profile-1',
        promptContent: 'Fix tests',
        workingDirectory: '/srv/repo',
        command: 'codex "$PROMPT"',
        status: 'completed',
        stdout: 'Done',
        stderr: '',
        rawOutput: 'Done',
        startedAt,
        triggeredBy: 'manual',
        createdAt: startedAt,
        updatedAt: startedAt,
      };
      const run = mapRun(runDoc);

      expect(run.queuedAt).toBe(startedAt.toISOString());
      expect(run.startedAt).toBe(startedAt.toISOString());
    });

    it('maps resource usage correctly', () => {
      const runDoc: Parameters<typeof mapRun>[0] = {
        _id: 'run-1',
        agentProfileId: 'p1',
        resourceUsage: { peakCpuPercent: 10, peakMemoryBytes: 1024 },
        createdAt: new Date(),
      };
      const run = mapRun(runDoc);
      expect(run.resourceUsage?.peakCpuPercent).toBe(10);
      expect(run.resourceUsage?.peakMemoryBytes).toBe(1024);
      expect(run.resourceUsage?.peakMemoryPercent).toBe(0);
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI color codes', () => {
      expect(stripAnsi('\u001b[31mHello\u001b[0m')).toBe('Hello');
    });

    it('removes other control characters', () => {
      expect(stripAnsi('Hello\x00World')).toBe('HelloWorld');
    });
  });

  describe('shellEscape', () => {
    it('escapes single quotes', () => {
      expect(shellEscape("it's a test")).toBe("'it'\"'\"'s a test'");
    });
  });

  describe('resolveInvocationTemplate', () => {
    it('replaces $PROMPT and $WORKING_DIR', () => {
      const template = 'run --dir $WORKING_DIR --prompt $PROMPT';
      const result = resolveInvocationTemplate(template, 'hello', '/app');
      expect(result).toBe("run --dir '/app' --prompt 'hello'");
    });

    it('replaces ${PROMPT} and ${WORKING_DIR}', () => {
      const template = 'run --dir ${WORKING_DIR} --prompt ${PROMPT}';
      const result = resolveInvocationTemplate(template, 'hello', '/app');
      expect(result).toBe("run --dir '/app' --prompt 'hello'");
    });

    it('keeps quoted prompt placeholders parseable when the prompt contains apostrophes', () => {
      const template = 'codex exec "$PROMPT"';
      const result = resolveInvocationTemplate(template, "don't ask", '/app');
      expect(result).toBe("codex exec 'don'\"'\"'t ask'");
    });
  });

  describe('appendOutput', () => {
    it('appends text within limit', () => {
      const result = appendOutput('hi', ' there', 10, false);
      expect(result.value).toBe('hi there');
      expect(result.truncated).toBe(false);
    });

    it('truncates when limit exceeded', () => {
      const result = appendOutput('12345', '67890', 5, false);
      expect(result.truncated).toBe(true);
      expect(result.value).toContain('[output truncated]');
    });

    it('returns existing if already truncated', () => {
      const result = appendOutput('existing', 'new', 100, true);
      expect(result.value).toBe('existing');
    });
  });

  describe('applyOutputChunk', () => {
    it('updates stdout buffers', () => {
      let buffers = createEmptyBuffers();
      buffers = applyOutputChunk(buffers, 'stdout', 'hello', 100);
      expect(buffers.stdout).toBe('hello');
      expect(buffers.rawOutput).toBe('hello');
    });

    it('updates stderr buffers', () => {
      let buffers = createEmptyBuffers();
      buffers = applyOutputChunk(buffers, 'stderr', 'error', 100);
      expect(buffers.stderr).toBe('error');
      expect(buffers.rawOutput).toBe('error');
    });
  });

  describe('shouldRetryJob', () => {
    it('returns true if attempts < maxAttempts', () => {
      const job: Parameters<typeof shouldRetryJob>[0] = { attemptCount: 1, maxAttempts: 2 };
      expect(shouldRetryJob(job)).toBe(true);
    });

    it('returns false if attempts >= maxAttempts', () => {
      const job: Parameters<typeof shouldRetryJob>[0] = { attemptCount: 2, maxAttempts: 2 };
      expect(shouldRetryJob(job)).toBe(false);
    });
  });

  describe('getNextRunTimeFromExpression', () => {
    it('returns next run time for valid expression', () => {
      const result = getNextRunTimeFromExpression('* * * * *', new Date('2026-04-22T10:00:00Z'));
      expect(result).toBeDefined();
    });

    it('returns undefined for invalid expression', () => {
      expect(getNextRunTimeFromExpression('invalid')).toBeUndefined();
    });
  });

  describe('validateProfileTemplate', () => {
    const execMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    it('returns valid for a correct template', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo $PROMPT in $WORKING_DIR',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error if $PROMPT is missing', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo hello',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invocation template must include the $PROMPT placeholder');
    });

    it('returns error for unbalanced quotes', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo "$PROMPT',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Invocation template has unbalanced quotes or command substitutions'
      );
    });

    it('handles subshell substitutions', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo $(echo $PROMPT)',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.valid).toBe(true);
    });

    it('detects unbalanced subshell substitutions', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo $(echo $PROMPT',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Invocation template has unbalanced quotes or command substitutions'
      );
    });

    it('returns error for dangerous patterns', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'rm -rf / $PROMPT',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invocation template contains a dangerous shell pattern');
    });

    it('returns warning if $WORKING_DIR is missing', async () => {
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo $PROMPT',
        shell: '/bin/bash',
        execFileAsync: execMock,
      });
      expect(result.warnings).toContain(
        'Template does not reference $WORKING_DIR; the run will still start in the configured directory'
      );
    });

    it('returns error if shell validation fails', async () => {
      const failingExec = vi.fn().mockRejectedValue(new Error('Syntax error'));
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo $PROMPT',
        shell: '/bin/bash',
        execFileAsync: failingExec,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Shell validation failed: Syntax error');
    });

    it('handles non-error objects in shell validation failure', async () => {
      const failingExec = vi.fn().mockRejectedValue('Something went wrong');
      const result = await validateProfileTemplate({
        invocationTemplate: 'echo $PROMPT',
        shell: '/bin/bash',
        execFileAsync: failingExec,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Shell validation failed: Unknown shell parse error');
    });
  });

  describe('ensureDirectoryExists', () => {
    it('resolves if directory exists', async () => {
      await expect(ensureDirectoryExists('.')).resolves.toBeUndefined();
    });

    it('rejects if directory does not exist', async () => {
      await expect(ensureDirectoryExists('./non-existent-dir-12345')).rejects.toThrow();
    });
  });

  describe('resolvePromptContent', () => {
    it('returns content as is for inline type', async () => {
      const result = await resolvePromptContent('inline', 'my content');
      expect(result).toBe('my content');
    });

    it('reads file for file-reference type', async () => {
      const result = await resolvePromptContent('file-reference', 'package.json');
      expect(result).toContain('servermon');
    });

    it('handles @ prefix in file-reference', async () => {
      const result = await resolvePromptContent('file-reference', '@package.json');
      expect(result).toContain('servermon');
    });
  });
});
