import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '@/lib/logger';
import type { ExecutionInput, ExecutionResult } from './types';

const log = createLogger('endpoints:script');

const LANG_BINARY: Record<string, string> = {
  python: 'python3',
  bash: 'bash',
  node: 'node',
};

const LANG_FLAG: Record<string, string[]> = {
  python: ['-c'],
  bash: ['-c'],
  node: ['-e'],
};

export interface ScriptExecutionConfig {
  scriptLang?: 'python' | 'bash' | 'node';
  scriptContent?: string;
  timeout?: number;
  envVars?: Record<string, string> | Map<string, string>;
  slug?: string;
}

function buildEnv(endpoint: ScriptExecutionConfig, input: ExecutionInput): Record<string, string> {
  const safeEnv: Record<string, string> = {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: '/tmp',
    LANG: 'en_US.UTF-8',
    ENDPOINT_METHOD: input.method,
    ENDPOINT_QUERY: JSON.stringify(input.query),
    ENDPOINT_HEADERS: JSON.stringify(input.headers),
  };

  if (input.body) {
    safeEnv.ENDPOINT_BODY = input.body;
    safeEnv.REQUEST_BODY = input.body;
  }

  if (endpoint.envVars) {
    const vars =
      endpoint.envVars instanceof Map
        ? Object.fromEntries(endpoint.envVars as Map<string, string>)
        : (endpoint.envVars as Record<string, string>);
    for (const [key, value] of Object.entries(vars)) {
      safeEnv[key] = String(value);
    }
  }

  return safeEnv;
}

export async function executeScript(
  endpoint: ScriptExecutionConfig,
  input: ExecutionInput
): Promise<ExecutionResult> {
  const lang = endpoint.scriptLang || 'bash';
  const binary = LANG_BINARY[lang];
  const flags = LANG_FLAG[lang];
  const code = endpoint.scriptContent || '';
  const timeout = endpoint.timeout || 30_000;

  if (!binary) {
    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: `Unsupported script language: ${lang}` }),
      error: `Unsupported script language: ${lang}`,
      duration: 0,
    };
  }

  if (!code.trim()) {
    return {
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: 'Script content is empty' }),
      error: 'Script content is empty',
      duration: 0,
    };
  }

  const env = buildEnv(endpoint, input);

  return new Promise<ExecutionResult>((resolve) => {
    const args = [...flags, code];
    let child: ChildProcess;
    try {
      child = spawn(binary, args, {
        env: env as NodeJS.ProcessEnv,
        timeout,
        cwd: '/tmp',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return resolve({
        statusCode: 500,
        headers: {},
        body: JSON.stringify({ error: `Failed to spawn: ${message}` }),
        error: message,
        duration: 0,
      });
    }

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.on('error', (err) => {
      stderr += `Process error: ${err.message}\n`;
    });

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 10_240) {
        stdout = stdout.slice(0, 10_240);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 10_240) {
        stderr = stderr.slice(0, 10_240);
      }
    });

    if (input.body && child.stdin) {
      child.stdin.on('error', (err) => {
        log.warn(`stdin error: ${err.message}`);
      });
      child.stdin.write(input.body);
    }
    child.stdin?.end();

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeout);

    child.on('close', (exitCode: number | null) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          statusCode: 504,
          headers: {},
          body: JSON.stringify({ error: `Script timed out after ${timeout}ms` }),
          stdout,
          stderr,
          error: `Script timed out after ${timeout}ms`,
          duration: timeout,
        });
        return;
      }

      const isSuccess = exitCode === 0;
      let responseBody = stdout.trim();
      const headers: Record<string, string> = {};

      try {
        JSON.parse(responseBody);
        headers['content-type'] = 'application/json';
      } catch {
        headers['content-type'] = 'text/plain';
      }

      if (!isSuccess && !responseBody) {
        responseBody = JSON.stringify({
          error: stderr.trim() || `Script exited with code ${exitCode}`,
        });
        headers['content-type'] = 'application/json';
      }

      resolve({
        statusCode: isSuccess ? 200 : 500,
        headers,
        body: responseBody,
        stdout,
        stderr,
        error: isSuccess ? undefined : stderr.trim() || `Exit code: ${exitCode}`,
        duration: 0,
      });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      log.error(`Script spawn error: ${err.message}`);
      resolve({
        statusCode: 500,
        headers: {},
        body: JSON.stringify({ error: `Failed to execute script: ${err.message}` }),
        error: err.message,
        duration: 0,
      });
    });
  });
}
