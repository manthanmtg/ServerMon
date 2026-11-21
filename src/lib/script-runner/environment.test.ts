import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  combineLaunchEnvironment,
  openEnvironment,
  partitionRunEnvironment,
  sealEnvironment,
} from './environment';
import { launchInput, scriptInput } from './schemas';
import { encodeLaunch, parseRunnerProbe } from './systemd';

const legacy = { title: 'Check', cwd: '/tmp', source: 'echo hi', args: [] };

afterEach(() => vi.unstubAllEnvs());

describe('Script Runner launch settings', () => {
  it('defaults legacy saved scripts and keeps omitted run overrides distinguishable', () => {
    expect(scriptInput.parse(legacy)).toMatchObject({ language: 'bash', env: [] });
    expect(launchInput.parse(legacy)).not.toHaveProperty('language');
    expect(launchInput.parse(legacy)).not.toHaveProperty('env');
    expect(launchInput.parse({ ...legacy, env: [] })).toHaveProperty('env', []);
  });

  it('rejects invalid names and duplicate keys while preserving literal values', () => {
    const env = [{ key: 'BUILD_LABEL', value: '  first\n$second=other  ' }];
    expect(launchInput.parse({ ...legacy, language: 'python', env }).env).toEqual(env);
    expect(launchInput.safeParse({ ...legacy, env: [...env, ...env] }).success).toBe(false);
    expect(launchInput.safeParse({ ...legacy, env: [{ key: '-X', value: '1' }] }).success).toBe(
      false
    );
    expect(launchInput.safeParse({ ...legacy, language: 'ruby' }).success).toBe(false);
  });

  it('encrypts saved values, supports clearing them, and rejects a changed key', () => {
    vi.stubEnv('JWT_SECRET', 'temporary-test-key');
    const env = [{ key: 'DEPLOY_TOKEN', value: 'private fixture' }];
    const encrypted = sealEnvironment(env);
    expect(encrypted).not.toContain('private fixture');
    expect(openEnvironment(encrypted)).toEqual(env);
    expect(openEnvironment(sealEnvironment([]))).toEqual([]);
    vi.stubEnv('JWT_SECRET', 'different-test-key');
    expect(() => openEnvironment(encrypted)).toThrow();
  });

  it('requires a stable key for every nonempty environment', () => {
    vi.stubEnv('JWT_SECRET', undefined);
    expect(sealEnvironment([])).toBeNull();
    expect(() => sealEnvironment([{ key: 'MODE', value: 'example' }])).toThrow('JWT_SECRET');
  });

  it('distinguishes legacy hosts from workers with runtime and environment support', () => {
    expect(parseRunnerProbe('252.39-1\n')).toEqual({ protocol: 1, runtimes: ['bash'] });
    expect(parseRunnerProbe('script-runner-v2\nbash\npython\n')).toEqual({
      protocol: 2,
      runtimes: ['bash', 'python'],
    });
    expect(encodeLaunch(legacy, 1)).toBe(['/tmp', '0', 'echo hi'].join('\0'));
  });
});

describe('linked run environments', () => {
  it('uses a per-run override and marks only effective linked values as private', () => {
    const result = combineLaunchEnvironment(
      [
        { key: 'APP_MODE', value: 'default' },
        { key: 'DEPLOY_TOKEN', value: 'linked secret' },
      ],
      [{ key: 'APP_MODE', value: 'override' }]
    );

    expect(result).toEqual({
      env: [
        { key: 'APP_MODE', value: 'override' },
        { key: 'DEPLOY_TOKEN', value: 'linked secret' },
      ],
      linkedEnvKeys: ['DEPLOY_TOKEN'],
    });
    expect(partitionRunEnvironment(result.env, result.linkedEnvKeys)).toEqual({
      editable: [{ key: 'APP_MODE', value: 'override' }],
      linked: [{ key: 'DEPLOY_TOKEN', value: 'linked secret' }],
    });
  });

  it('limits the effective environment after adding linked values', () => {
    const populated = Array.from({ length: 32 }, (_, index) => ({
      key: `VAR_${index}`,
      value: '',
    }));
    expect(() => combineLaunchEnvironment(populated, [{ key: 'EXTRA', value: '' }])).toThrow();
  });
});
