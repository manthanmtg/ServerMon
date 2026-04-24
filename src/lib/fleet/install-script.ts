export type InstallerKind = 'linux' | 'docker' | 'macos';

export interface InstallSnippetInput {
  kind: InstallerKind;
  hubUrl: string;
  token: string;
  nodeId: string;
  agentImage?: string;
  installerBaseUrl?: string;
}

function shellEscape(value: string): string {
  // Wrap in single quotes, escape inner single quotes via '"'"'
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function renderInstallSnippet(i: InstallSnippetInput): string {
  const base = i.installerBaseUrl ?? `https://${i.hubUrl}`;
  const hubArg = shellEscape(i.hubUrl);
  const tokenArg = shellEscape(i.token);
  const nodeArg = shellEscape(i.nodeId);

  if (i.kind === 'linux') {
    return `curl -sL ${base}/install-agent.sh | bash -s -- --hub-url ${hubArg} --token ${tokenArg} --node-id ${nodeArg}`;
  }
  if (i.kind === 'macos') {
    return `curl -sL ${base}/install-agent.sh | bash -s -- --hub-url ${hubArg} --token ${tokenArg} --node-id ${nodeArg} --platform macos`;
  }
  if (i.kind === 'docker') {
    const image = i.agentImage ?? 'servermon/agent:latest';
    return `docker run -d --name servermon-agent --restart unless-stopped -e FLEET_HUB_URL=${hubArg} -e FLEET_PAIRING_TOKEN=${tokenArg} -e FLEET_NODE_ID=${nodeArg} ${image}`;
  }
  throw new Error(`Unknown installer kind: ${String(i.kind)}`);
}
