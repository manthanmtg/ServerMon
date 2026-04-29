import { describe, expect, it } from 'vitest';
import { buildInstallServerMonCommand, redactServerMonInstallText } from './servermonAgentCommands';

describe('servermonAgentCommands', () => {
  it('builds fixed installer command with remote MongoDB defaults', () => {
    const command = buildInstallServerMonCommand({
      mongoUri: 'mongodb://db/servermon',
      port: 8912,
      skipMongo: true,
      allowRoot: true,
      sourceDir: '/opt/servermon-agent/source',
    });

    expect(command).toEqual([
      'bash',
      [
        '-lc',
        [
          "cd '/opt/servermon-agent/source'",
          './scripts/install.sh --unattended --port "$SERVERMON_INSTALL_PORT" --mongo-uri "$SERVERMON_INSTALL_MONGO_URI" --allow-root --skip-mongo',
        ].join(' && '),
      ],
    ]);
  });

  it('omits skip-mongo and allow-root flags when disabled', () => {
    const command = buildInstallServerMonCommand({
      mongoUri: 'mongodb://db/servermon',
      port: 8912,
      skipMongo: false,
      allowRoot: false,
    });

    expect(command[1][1]).not.toContain('--skip-mongo');
    expect(command[1][1]).not.toContain('--allow-root');
  });

  it('rejects missing MongoDB URI', () => {
    expect(() =>
      buildInstallServerMonCommand({
        mongoUri: '',
        port: 8912,
        skipMongo: true,
        allowRoot: true,
      })
    ).toThrow(/MongoDB URI/);
  });

  it('redacts MongoDB URI from log text', () => {
    expect(
      redactServerMonInstallText(
        'MongoDB: mongodb://user:pass@db/servermon\nDone',
        'mongodb://user:pass@db/servermon'
      )
    ).toBe('MongoDB: [redacted-mongodb-uri]\nDone');
  });
});
