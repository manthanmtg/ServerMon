import { buildDefaultServerMonRouteIntent } from './servermonInstall';
import { buildHubRouteDomain, slugifyRouteName } from './domain';
import type { ServerMonStatus } from './servermonStatus';
import type { ServerMonBridgeRouteCandidate, ServerMonBridgeSnapshot } from './servermonBridge';
import type { ExposeForm } from '@/modules/fleet/ui/details/exposeService/schema';

export interface ExistingPublicRouteForSuggestion {
  _id?: unknown;
  nodeId?: unknown;
  name?: string;
  slug?: string;
  domain?: string;
  proxyRuleName?: string;
  templateId?: string;
  target?: {
    localIp: string;
    localPort: number;
    protocol: 'http' | 'https' | 'tcp';
  };
}

export interface FleetRouteSuggestionNode {
  _id: unknown;
  name: string;
  slug: string;
  tunnelStatus?: string;
  servermon?: ServerMonStatus;
  servermonBridge?: ServerMonBridgeSnapshot | null;
}

export interface FleetRouteSuggestion {
  id: string;
  kind: ServerMonBridgeRouteCandidate['kind'];
  title: string;
  description: string;
  badge: string;
  targetLabel: string;
  sourceLabel: string;
  warning?: string;
  form: ExposeForm;
}

function objectIdToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toString' in value) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

function routeTargetMatches(
  route: ExistingPublicRouteForSuggestion,
  candidate: ServerMonBridgeRouteCandidate
): boolean {
  return (
    route.target?.localIp === candidate.target.localIp &&
    route.target.localPort === candidate.target.localPort &&
    route.target.protocol === candidate.target.protocol
  );
}

function routeMatchesCandidate(
  route: ExistingPublicRouteForSuggestion,
  candidate: ServerMonBridgeRouteCandidate
): boolean {
  if (candidate.kind === 'servermon') {
    return (
      route.templateId === 'servermon' ||
      route.proxyRuleName === 'servermon' ||
      routeTargetMatches(route, candidate)
    );
  }
  return routeTargetMatches(route, candidate);
}

function candidateAlreadyRouted(
  candidate: ServerMonBridgeRouteCandidate,
  routes: ExistingPublicRouteForSuggestion[]
): boolean {
  return routes.some((route) => routeMatchesCandidate(route, candidate));
}

function engineTitle(candidate: ServerMonBridgeRouteCandidate): string {
  const engine = candidate.metadata?.database?.engine;
  if (engine === 'mongo') return 'MongoDB database detected';
  if (engine === 'postgres') return 'PostgreSQL database detected';
  if (engine === 'mysql') return 'MySQL database detected';
  return candidate.kind === 'servermon' ? 'ServerMon app detected' : 'Service detected';
}

function engineBadge(candidate: ServerMonBridgeRouteCandidate): string {
  if (candidate.kind === 'servermon') return 'ServerMon';
  return candidate.metadata?.database?.engine ?? candidate.module;
}

function sourceLabel(candidate: ServerMonBridgeRouteCandidate, bridge?: ServerMonBridgeSnapshot) {
  const source = candidate.kind === 'servermon' ? 'ServerMon app' : 'ServerMon module';
  return bridge?.collectedAt ? `${source} · ${bridge.collectedAt}` : source;
}

function targetLabel(candidate: ServerMonBridgeRouteCandidate): string {
  return `${candidate.target.localIp}:${candidate.target.localPort} · ${candidate.target.protocol}`;
}

function buildServerMonSuggestionForm(input: {
  node: FleetRouteSuggestionNode;
  candidate: ServerMonBridgeRouteCandidate;
  nodeId: string;
  subdomainHost?: string | null;
}): ExposeForm {
  const intent = buildDefaultServerMonRouteIntent({
    nodeId: input.nodeId,
    nodeName: input.node.name,
    nodeSlug: input.node.slug,
    port: input.candidate.target.localPort,
    subdomainHost: input.subdomainHost,
  });
  return {
    name: intent.name,
    slug: intent.slug,
    domain: intent.domain,
    domainMode: input.subdomainHost ? 'hub_subdomain' : 'custom',
    templateSlug: input.candidate.route.templateSlug,
    nodeId: input.nodeId,
    proxyRuleName: input.candidate.route.proxyRuleName,
    createNewProxyRule: true,
    target: input.candidate.target,
    accessMode: input.candidate.route.accessMode,
    tlsEnabled: input.candidate.route.tlsEnabled,
    tlsProvider: input.candidate.route.tlsEnabled ? 'letsencrypt' : undefined,
    websocketEnabled: input.candidate.route.websocketEnabled,
    timeoutSeconds: input.candidate.route.timeoutSeconds,
    maxBodyMb: input.candidate.route.maxBodyMb,
    compression: input.candidate.route.compression,
    headers: {},
  };
}

function buildDatabaseSuggestionForm(input: {
  node: FleetRouteSuggestionNode;
  candidate: ServerMonBridgeRouteCandidate;
  nodeId: string;
  subdomainHost?: string | null;
}): ExposeForm {
  const databaseSlug =
    input.candidate.metadata?.database?.slug || slugifyRouteName(input.candidate.name);
  const slug = slugifyRouteName(`${input.node.slug}-${databaseSlug}`);
  return {
    name: input.candidate.name,
    slug,
    domain: buildHubRouteDomain(slug, input.subdomainHost),
    domainMode: input.subdomainHost ? 'hub_subdomain' : 'custom',
    templateSlug: input.candidate.route.templateSlug,
    nodeId: input.nodeId,
    proxyRuleName: input.candidate.route.proxyRuleName,
    createNewProxyRule: true,
    target: input.candidate.target,
    accessMode: input.candidate.route.accessMode,
    tlsEnabled: input.candidate.route.tlsEnabled,
    tlsProvider: input.candidate.route.tlsEnabled ? 'letsencrypt' : undefined,
    websocketEnabled: input.candidate.route.websocketEnabled,
    timeoutSeconds: input.candidate.route.timeoutSeconds,
    maxBodyMb: input.candidate.route.maxBodyMb,
    compression: input.candidate.route.compression,
    headers: {},
  };
}

function fallbackServerMonCandidate(
  node: FleetRouteSuggestionNode
): ServerMonBridgeRouteCandidate | null {
  const servermon = node.servermon;
  if (
    !servermon?.installed ||
    servermon.serviceState !== 'running' ||
    servermon.healthStatus !== 'healthy'
  ) {
    return null;
  }
  return {
    id: 'servermon:app',
    kind: 'servermon',
    module: 'servermon',
    name: 'ServerMon app',
    status: 'running',
    target: { localIp: '127.0.0.1', localPort: servermon.port, protocol: 'http' },
    route: {
      eligible: true,
      templateSlug: 'servermon',
      proxyRuleName: 'servermon',
      accessMode: 'servermon_auth',
      tlsEnabled: true,
      websocketEnabled: true,
      compression: true,
      timeoutSeconds: 300,
      maxBodyMb: 64,
    },
    securityNotes: [],
  };
}

export function buildFleetRouteSuggestions(input: {
  node: FleetRouteSuggestionNode;
  existingRoutes: ExistingPublicRouteForSuggestion[];
  subdomainHost?: string | null;
}): FleetRouteSuggestion[] {
  const nodeId = objectIdToString(input.node._id);
  const bridge = input.node.servermonBridge ?? undefined;
  const bridgeCandidates = bridge?.routeCandidates ?? [];
  const hasBridgeServerMon = bridgeCandidates.some((candidate) => candidate.kind === 'servermon');
  const fallback = hasBridgeServerMon ? null : fallbackServerMonCandidate(input.node);
  const candidates = [...(fallback ? [fallback] : []), ...bridgeCandidates];

  return candidates
    .filter((candidate) => candidate.status === 'running' && candidate.route.eligible)
    .filter((candidate) => !candidateAlreadyRouted(candidate, input.existingRoutes))
    .map((candidate) => {
      const form =
        candidate.kind === 'servermon'
          ? buildServerMonSuggestionForm({
              node: input.node,
              candidate,
              nodeId,
              subdomainHost: input.subdomainHost,
            })
          : buildDatabaseSuggestionForm({
              node: input.node,
              candidate,
              nodeId,
              subdomainHost: input.subdomainHost,
            });
      return {
        id: candidate.id,
        kind: candidate.kind,
        title: engineTitle(candidate),
        description:
          candidate.kind === 'servermon'
            ? `${input.node.name} is running the ServerMon app locally.`
            : `${candidate.name} is running on this fleet machine.`,
        badge: engineBadge(candidate),
        targetLabel: targetLabel(candidate),
        sourceLabel: sourceLabel(candidate, bridge),
        warning: candidate.kind === 'database' ? candidate.securityNotes[1] : undefined,
        form,
      };
    });
}
