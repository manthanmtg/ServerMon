import { TERMINAL_BRIDGE_PROXY_NAME, terminalBridgeRemotePort } from './toml';

export interface ResolveAgentEndpointDeps {
  Node: ResolveAgentEndpointNodeLookup;
}

export interface ResolvedAgentEndpoint {
  host: string;
  port: number;
  authToken: string;
}

interface ResolveAgentEndpointNodeLookup {
  findById(nodeId: string): PromiseLike<ResolveAgentEndpointNodeDoc | null>;
}

interface ResolveAgentEndpointNodeDoc {
  slug?: string;
  capabilities?: { terminal?: boolean };
  ptyBridge?: { port?: number; authToken?: string };
  proxyRules?: Array<{
    name?: string;
    type?: string;
    enabled?: boolean;
    status?: string;
    remotePort?: number;
  }>;
}

/**
 * Resolves the hub-side TCP endpoint for a node's agent PTY bridge. The bridge
 * is exposed through frps on 127.0.0.1:<remotePort>, then authenticated with the
 * per-agent ptyBridge token reported on heartbeat.
 */
export async function resolveAgentEndpoint(
  nodeId: string,
  deps: ResolveAgentEndpointDeps
): Promise<ResolvedAgentEndpoint | null> {
  const node = await deps.Node.findById(nodeId);
  if (!node) return null;
  if (node.capabilities?.terminal === false) return null;
  if (!node.ptyBridge?.authToken) return null;

  const rules = node.proxyRules ?? [];
  const terminalBridge = rules.find(
    (r) =>
      (r?.name === TERMINAL_BRIDGE_PROXY_NAME || r?.name === 'terminal') &&
      r.enabled !== false &&
      typeof r.remotePort === 'number'
  );

  return {
    host: '127.0.0.1',
    port: terminalBridge?.remotePort ?? terminalBridgeRemotePort(node.slug ?? nodeId),
    authToken: node.ptyBridge.authToken,
  };
}
