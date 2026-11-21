import { describe, expect, it } from 'vitest';
import { buildAgentUpdateShell, parseAgentUpdateShellOptions } from './agentUpdateCommand';

describe('buildAgentUpdateShell', () => {
  it('defaults to metadata-driven auto mode and supports release artifacts', () => {
    const script = buildAgentUpdateShell();

    expect(script).toContain('SERVERMON_AGENT_INSTALL_MODE');
    expect(script).toContain('servermon-agent-$PLATFORM_NAME-$ARCH_NAME.tar.gz');
    expect(script).toContain('SHA256SUMS');
    expect(script).toContain('sha256sum -c');
    expect(script).toContain('shasum -a 256 -c');
    expect(script).toContain('RELEASE_TMP_DIR="$(mktemp -d)"');
    expect(script).toContain('trap \'rm -rf "$RELEASE_TMP_DIR"\' EXIT');
    expect(script).not.toContain('trap \'rm -rf "$tmp_dir"\' EXIT');
    expect(script).toContain('install_from_release');
    expect(script).toContain('install_from_source');
    expect(script).toContain('systemctl restart servermon-agent.service');
  });

  it('can force a pinned release version without building from source', () => {
    const script = buildAgentUpdateShell({
      mode: 'release',
      versionTarget: 'v0.1.1',
      serviceName: 'servermon-agent.service',
    });

    expect(script).toContain('UPDATE_MODE="release"');
    expect(script).toContain('VERSION_TARGET="v0.1.1"');
    expect(script).toContain('/releases/download/$VERSION_TARGET');
    expect(script).toContain('pnpm build');
    expect(script.indexOf('install_from_release')).toBeLessThan(
      script.indexOf('systemctl restart servermon-agent.service')
    );
  });

  it('can force source mode for main-tracking installs', () => {
    const script = buildAgentUpdateShell({
      mode: 'source',
      sourceRef: 'main',
    });

    expect(script).toContain('UPDATE_MODE="source"');
    expect(script).toContain('SOURCE_REF="main"');
    expect(script).toContain('git pull --rebase');
    expect(script).toContain('pnpm build');
  });

  it('treats a version-only remote update as a release update', () => {
    expect(parseAgentUpdateShellOptions({ versionTarget: 'v0.1.1' })).toMatchObject({
      mode: 'release',
      versionTarget: 'v0.1.1',
    });
  });
});
