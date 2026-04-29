import { describe, expect, it } from 'vitest';
import { buildInstallServerMonCommand, redactServerMonInstallText } from './servermonAgentCommands';

describe('servermonAgentCommands', () => {
  it('builds release artifact installer command by default', () => {
    const command = buildInstallServerMonCommand({
      mongoUri: 'mongodb://db/servermon',
      port: 8912,
      skipMongo: true,
      allowRoot: true,
      versionTarget: 'v0.1.1',
      releaseBaseUrl: 'https://mirror.example.com/releases/v0.1.1',
    });

    expect(command[0]).toBe('bash');
    expect(command[1][0]).toBe('-lc');
    expect(command[1][1]).toContain('INSTALL_MODE="release"');
    expect(command[1][1]).toContain('VERSION_TARGET="v0.1.1"');
    expect(command[1][1]).toContain('RELEASE_BASE_URL="https://mirror.example.com/releases/v0.1.1"');
    expect(command[1][1]).toContain('servermon-hub-$PLATFORM_NAME-$ARCH_NAME.tar.gz');
    expect(command[1][1]).toContain('SHA256SUMS');
    expect(command[1][1]).toContain('run_installer release --prebuilt');
    expect(command[1][1]).toContain('./scripts/install.sh "$@" --unattended');
  });

  it('builds source installer command when requested', () => {
    const command = buildInstallServerMonCommand({
      installMode: 'source',
      mongoUri: 'mongodb://db/servermon',
      port: 8912,
      skipMongo: true,
      allowRoot: true,
      sourceRef: 'main',
      sourceDir: '/opt/servermon-agent/source',
    });

    expect(command[1][1]).toContain('INSTALL_MODE="source"');
    expect(command[1][1]).toContain('SOURCE_REF="main"');
    expect(command[1][1]).toContain("SOURCE_DIR='/opt/servermon-agent/source'");
    expect(command[1][1]).toContain('run_installer source');
    expect(command[1][1]).toContain('./scripts/install.sh "$@" --unattended');
  });

  it('omits skip-mongo and allow-root flags when disabled', () => {
    const command = buildInstallServerMonCommand({
      installMode: 'source',
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
