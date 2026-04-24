import { describe, it, expect } from 'vitest';
import { renderInstallSnippet } from './install-script';

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
    expect(out).toContain('curl -sL https://staging.example.com/install-agent.sh |');
  });

  it('docker: docker run with env vars and default image', () => {
    const out = renderInstallSnippet({ ...base, kind: 'docker' });
    expect(out).toBe(
      "docker run -d --name servermon-agent --restart unless-stopped -e FLEET_HUB_URL='ultron.manthanby.cv' -e FLEET_PAIRING_TOKEN='tok-ABC-xyz' -e FLEET_NODE_ID='node-1' servermon/agent:latest"
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
      "curl -sL https://ultron.manthanby.cv/install-agent.sh | bash -s -- --hub-url 'ultron.manthanby.cv' --token 'tok-ABC-xyz' --node-id 'node-1' --platform macos"
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
