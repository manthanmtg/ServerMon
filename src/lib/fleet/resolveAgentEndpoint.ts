import type { Model } from 'mongoose';

export interface ResolveAgentEndpointDeps {
  Node: Model<unknown>;
}

export interface ResolvedAgentEndpoint {
  host: string;
  port: number;
  authToken: string;
}

interface NodeDoc {
  proxyRules?: Array<{
    name?: string;
    type?: string;
    enabled?: boolean;
    remotePort?: number;
  }>;
}

/**
 * Resolves the local agent endpoint for a given node, based on its terminal
 * proxy rule. Returns null if the node is not found, has no enabled `terminal`
 * proxy rule, or the rule does not declare a remote port.
 *
 * In Phase 2 the hub assumes the agent's pty bridge is reachable via
 * 127.0.0.1:<remotePort> (i.e. via the FRP TCP tunnel), authenticated with
 * `FLEET_HUB_AUTH_TOKEN`.
 */
export async function resolveAgentEndpoint(
  nodeId: string,
  deps: ResolveAgentEndpointDeps
): Promise<ResolvedAgentEndpoint | null> {
  const node = (await deps.Node.findById(nodeId)) as unknown as NodeDoc | null;
  if (!node) return null;
  const rules = node.proxyRules ?? [];
  const terminal = rules.find(
    (r) => r?.name === 'terminal' && r.enabled === true && typeof r.remotePort === 'number'
  );
  if (!terminal || typeof terminal.remotePort !== 'number') return null;
  const authToken = process.env.FLEET_HUB_AUTH_TOKEN ?? 'pending';
  return {
    host: '127.0.0.1',
    port: terminal.remotePort,
    authToken,
  };
}
