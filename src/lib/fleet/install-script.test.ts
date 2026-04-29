import { describe, it, expect } from 'vitest';
import { AGENT_INSTALLER_BASH, renderInstallSnippet } from './install-script';

const base = {
  hubUrl: 'ultron.manthanby.cv',
  token: 'tok-ABC-xyz',
  nodeId: 'node-1',
};

describe('renderInstallSnippet', () => {
  it('linux: curl | bash with hub-url/token/node-id flags', () => {
    const out = renderInstallSnippet({ ...base, kind: 'linux' });
    expect(out).toBe(
      "curl -sL https://ultron.manthanby.cv/api/fleet/public/install-script | bash -s -- --hub-url 'ultron.manthanby.cv' --token 'tok-ABC-xyz' --node-id 'node-1'"
    );
  });

  it('linux: uses custom installerBaseUrl when provided', () => {
    const out = renderInstallSnippet({
      ...base,
      kind: 'linux',
      installerBaseUrl: 'https://staging.example.com',
    });
    expect(out).toContain('curl -sL https://staging.example.com/api/fleet/public/install-script |');
  });

  it('docker: docker run with env vars and default image', () => {
    const out = renderInstallSnippet({ ...base, kind: 'docker' });
    expect(out).toBe(
      "docker run -d --name servermon-agent --restart unless-stopped -e PORT=8918 -e FLEET_AGENT_PTY_PORT=8918 -e FLEET_HUB_URL='ultron.manthanby.cv' -e FLEET_PAIRING_TOKEN='tok-ABC-xyz' -e FLEET_NODE_ID='node-1' servermon/agent:latest"
    );
  });

  it('docker: uses custom agentImage when provided', () => {
    const out = renderInstallSnippet({
      ...base,
      kind: 'docker',
      agentImage: 'myorg/agent:v2',
    });
    expect(out).toContain(' myorg/agent:v2');
    expect(out).not.toContain('servermon/agent:latest');
  });

  it('macos: curl | bash with --platform macos flag', () => {
    const out = renderInstallSnippet({ ...base, kind: 'macos' });
    expect(out).toBe(
      "curl -sL https://ultron.manthanby.cv/api/fleet/public/install-script | bash -s -- --hub-url 'ultron.manthanby.cv' --token 'tok-ABC-xyz' --node-id 'node-1' --platform macos"
    );
  });

  it("escapes single quote in token via '\"'\"' (linux)", () => {
    const out = renderInstallSnippet({
      ...base,
      kind: 'linux',
      token: "it's-a-token",
    });
    expect(out).toContain(`'it'"'"'s-a-token'`);
  });

  it("escapes single quote in token via '\"'\"' (docker)", () => {
    const out = renderInstallSnippet({
      ...base,
      kind: 'docker',
      token: "it's-a-token",
    });
    expect(out).toContain(`FLEET_PAIRING_TOKEN='it'"'"'s-a-token'`);
  });

  it("escapes single quote in token via '\"'\"' (macos)", () => {
    const out = renderInstallSnippet({
      ...base,
      kind: 'macos',
      token: "it's-a-token",
    });
    expect(out).toContain(`--token 'it'"'"'s-a-token'`);
  });

  it('throws on unknown kind', () => {
    expect(() =>
      renderInstallSnippet({
        ...base,
        kind: 'windows' as unknown as 'linux',
      })
    ).toThrow(/Unknown installer kind/);
  });
});

describe('AGENT_INSTALLER_BASH', () => {
  it('installs release artifacts by default with checksum verification', () => {
    expect(AGENT_INSTALLER_BASH).toContain('INSTALL_MODE="release"');
    expect(AGENT_INSTALLER_BASH).toContain('servermon-agent-$PLATFORM_NAME-$ARCH_NAME.tar.gz');
    expect(AGENT_INSTALLER_BASH).toContain('SHA256SUMS');
    expect(AGENT_INSTALLER_BASH).toContain('sha256sum -c');
    expect(AGENT_INSTALLER_BASH).toContain('shasum -a 256 -c');
    expect(AGENT_INSTALLER_BASH).toContain('install_from_release');
    expect(AGENT_INSTALLER_BASH).toContain('write_install_metadata');
  });

  it('keeps explicit source builds available for main-tracking installs', () => {
    expect(AGENT_INSTALLER_BASH).toContain('--build-from-source');
    expect(AGENT_INSTALLER_BASH).toContain('--source-ref');
    expect(AGENT_INSTALLER_BASH).toContain('install_from_source');
    expect(AGENT_INSTALLER_BASH).toContain('pnpm build');
  });

  it('supports latest and pinned release selection', () => {
    expect(AGENT_INSTALLER_BASH).toContain('--release');
    expect(AGENT_INSTALLER_BASH).toContain('--version');
    expect(AGENT_INSTALLER_BASH).toContain('/releases/latest/download');
    expect(AGENT_INSTALLER_BASH).toContain('/releases/download/$VERSION_TARGET');
  });
});
