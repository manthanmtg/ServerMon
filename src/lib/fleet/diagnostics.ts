export type StepStatus = 'pass' | 'fail' | 'unknown';

export interface DiagnosticStepResult {
  step: string;
  status: StepStatus;
  evidence?: string;
  likelyCause?: string;
  recommendedFix?: string;
  durationMs: number;
}

export interface DiagnosticStep<Ctx> {
  id: string;
  label: string;
  run(ctx: Ctx): Promise<Omit<DiagnosticStepResult, 'step' | 'durationMs'>>;
}

export interface RunChainOpts {
  stopOnFail?: boolean;
}

export function sanitize(s: string): string {
  if (!s) return s;
  let out = s;
  // Argon2 hashes: $argon2...$...$...$...$...
  out = out.replace(/\$argon2[a-z0-9]+\$[^\s]+/gi, '***');
  // JWT-like: three base64url segments separated by dots
  out = out.replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '***');
  // Long base64url / token-like runs (40+ chars)
  out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '***');
  return out;
}

export async function runChain<Ctx>(
  steps: DiagnosticStep<Ctx>[],
  ctx: Ctx,
  opts: RunChainOpts = {}
): Promise<DiagnosticStepResult[]> {
  const stopOnFail = opts.stopOnFail ?? true;
  const results: DiagnosticStepResult[] = [];
  for (const step of steps) {
    const start = Date.now();
    let partial: Omit<DiagnosticStepResult, 'step' | 'durationMs'>;
    try {
      partial = await step.run(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      partial = {
        status: 'fail',
        evidence: msg,
        likelyCause: 'Unhandled error while running diagnostic step',
        recommendedFix: 'Inspect server logs for the underlying exception and retry.',
      };
    }
    const durationMs = Date.now() - start;
    const evidence = partial.evidence !== undefined ? sanitize(partial.evidence) : undefined;
    const result: DiagnosticStepResult = {
      step: step.id,
      status: partial.status,
      evidence,
      likelyCause: partial.likelyCause,
      recommendedFix: partial.recommendedFix,
      durationMs,
    };
    results.push(result);
    if (stopOnFail && result.status === 'fail') {
      break;
    }
  }
  return results;
}

// --- Client diagnostic chain ---

export interface ClientDiagCtx {
  checkHubReachability(): Promise<{ ok: boolean; detail?: string }>;
  verifyTokenAuth(): Promise<{ ok: boolean; detail?: string }>;
  checkFrpsConnection(): Promise<{ ok: boolean; detail?: string }>;
  validateFrpcConfig(): Promise<{ ok: boolean; detail?: string }>;
  checkHeartbeatFresh(): Promise<{ ok: boolean; detail?: string }>;
  checkServiceManager(): Promise<{ ok: boolean; detail?: string }>;
  checkLocalCapabilities(): Promise<{ ok: boolean; detail?: string }>;
}

interface ChainEntry<Ctx> {
  id: string;
  label: string;
  method: keyof Ctx;
  likelyCause: string;
  recommendedFix: string;
}

function buildStep<Ctx>(entry: ChainEntry<Ctx>): DiagnosticStep<Ctx> {
  return {
    id: entry.id,
    label: entry.label,
    async run(ctx) {
      const fn = ctx[entry.method] as unknown as () => Promise<{
        ok: boolean;
        detail?: string;
      }>;
      const r = await fn.call(ctx);
      if (r.ok) {
        return { status: 'pass', evidence: r.detail };
      }
      return {
        status: 'fail',
        evidence: r.detail,
        likelyCause: entry.likelyCause,
        recommendedFix: entry.recommendedFix,
      };
    },
  };
}

export const CLIENT_DIAG_CHAIN: DiagnosticStep<ClientDiagCtx>[] = [
  buildStep<ClientDiagCtx>({
    id: 'hub.reachable',
    label: 'Hub reachable',
    method: 'checkHubReachability',
    likelyCause: 'Network/firewall blocks agent from reaching the hub.',
    recommendedFix: 'Verify outbound connectivity to the hub URL; check DNS and firewalls.',
  }),
  buildStep<ClientDiagCtx>({
    id: 'token.auth',
    label: 'Token authentication',
    method: 'verifyTokenAuth',
    likelyCause: 'Pairing token expired, rotated, or wrong.',
    recommendedFix: 'Regenerate a pairing token from the hub and re-run the installer.',
  }),
  buildStep<ClientDiagCtx>({
    id: 'frps.connection',
    label: 'FRPS control connection',
    method: 'checkFrpsConnection',
    likelyCause: 'frpc cannot connect to frps (port blocked or wrong address).',
    recommendedFix:
      'Confirm frps bind port is reachable from this host; check frpc server_addr / server_port.',
  }),
  buildStep<ClientDiagCtx>({
    id: 'frpc.config',
    label: 'frpc config valid',
    method: 'validateFrpcConfig',
    likelyCause: 'Generated frpc.toml is malformed or references missing fields.',
    recommendedFix: 'Regenerate frpc.toml from the latest template; run `frpc verify` against it.',
  }),
  buildStep<ClientDiagCtx>({
    id: 'heartbeat.fresh',
    label: 'Heartbeat fresh',
    method: 'checkHeartbeatFresh',
    likelyCause: 'Agent failed to post a recent heartbeat (process crashed or networking dropped).',
    recommendedFix: 'Check the agent service status and restart it; review agent logs.',
  }),
  buildStep<ClientDiagCtx>({
    id: 'serviceManager',
    label: 'Service manager running',
    method: 'checkServiceManager',
    likelyCause: 'Agent is not registered with systemd/launchd or is masked.',
    recommendedFix:
      'Re-install the agent service or enable/start the unit (systemctl enable --now / launchctl load).',
  }),
  buildStep<ClientDiagCtx>({
    id: 'localCapabilities',
    label: 'Local capabilities',
    method: 'checkLocalCapabilities',
    likelyCause: 'Agent reports missing local capabilities (permissions, dependencies).',
    recommendedFix: 'Grant the agent the required privileges or install missing dependencies.',
  }),
];

// --- Route diagnostic chain ---

export interface RouteDiagCtx {
  checkDns(): Promise<{ ok: boolean; detail?: string }>;
  checkTls(): Promise<{ ok: boolean; detail?: string }>;
  checkNginxConfig(): Promise<{ ok: boolean; detail?: string }>;
  checkNginxReloadState(): Promise<{ ok: boolean; detail?: string }>;
  checkFrpsRoute(): Promise<{ ok: boolean; detail?: string }>;
  checkFrpcTunnel(): Promise<{ ok: boolean; detail?: string }>;
  checkRemoteLocalPort(): Promise<{ ok: boolean; detail?: string }>;
  checkPublicUrl(): Promise<{ ok: boolean; detail?: string }>;
}

export const ROUTE_DIAG_CHAIN: DiagnosticStep<RouteDiagCtx>[] = [
  buildStep<RouteDiagCtx>({
    id: 'dns',
    label: 'DNS resolves to hub',
    method: 'checkDns',
    likelyCause: 'Route domain/wildcard DNS record is missing or points elsewhere.',
    recommendedFix: 'Add an A/CNAME record pointing the route domain at this hub.',
  }),
  buildStep<RouteDiagCtx>({
    id: 'tls',
    label: 'TLS certificate valid',
    method: 'checkTls',
    likelyCause: 'Certificate is missing, expired, or for the wrong domain.',
    recommendedFix: 'Issue/renew a certificate for the route domain (ACME or manual upload).',
  }),
  buildStep<RouteDiagCtx>({
    id: 'nginx.config',
    label: 'nginx config valid',
    method: 'checkNginxConfig',
    likelyCause: 'Generated nginx server block has a syntax error.',
    recommendedFix: 'Run `nginx -t`; fix the offending block and reload.',
  }),
  buildStep<RouteDiagCtx>({
    id: 'nginx.reloadState',
    label: 'nginx reload clean',
    method: 'checkNginxReloadState',
    likelyCause: 'Last nginx reload failed or nginx is not running.',
    recommendedFix: 'Start/reload nginx and check `systemctl status nginx`.',
  }),
  buildStep<RouteDiagCtx>({
    id: 'frps.route',
    label: 'frps knows the route',
    method: 'checkFrpsRoute',
    likelyCause: 'frps does not have the custom domain registered.',
    recommendedFix: 'Re-publish the route from the hub; verify frps admin API shows the proxy.',
  }),
  buildStep<RouteDiagCtx>({
    id: 'frpc.tunnel',
    label: 'frpc tunnel active',
    method: 'checkFrpcTunnel',
    likelyCause: 'Agent frpc does not have a matching proxy active.',
    recommendedFix: 'Regenerate frpc.toml on the agent and restart the agent service.',
  }),
  buildStep<RouteDiagCtx>({
    id: 'remote.localPort',
    label: 'Remote local port listening',
    method: 'checkRemoteLocalPort',
    likelyCause: 'The upstream service on the agent is not listening.',
    recommendedFix:
      'Start the upstream service on the agent and verify it binds the expected port.',
  }),
  buildStep<RouteDiagCtx>({
    id: 'public.url',
    label: 'Public URL responds',
    method: 'checkPublicUrl',
    likelyCause: 'End-to-end chain fails at the public URL.',
    recommendedFix: 'Re-run the route diagnostics chain and fix the first failing step.',
  }),
];
