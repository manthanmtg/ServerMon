# Fleet Management — Phase 2: Tunnel Runtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute waves A→E sequentially. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the Phase 1 scaffolding (models, renderers, APIs, UI) to real long-running processes. Phase 1 defined interfaces and persisted state; Phase 2 makes the tunnel actually move traffic.

**Architecture:** Hub mode spawns an in-process `FrpOrchestrator` + `NginxOrchestrator` that reconcile DB state with real `frps`/`nginx` child processes (download binary if missing → start/stop/reload based on desired state → stream stdout/stderr into FleetLogEvent). Revision apply engine bridges `ConfigRevision` writes to orchestrator reloads. Agent mode (toggled via `FLEET_AGENT_MODE=true`) spawns `frpc` + local pty WebSocket bridge + heartbeat loop. The hub exposes a Socket.IO `/api/fleet/tty` namespace that proxies xterm.js ↔ agent pty bridge through the FRP tunnel.

---

## Wave A: Orchestrators + apply engine

### A1: `src/lib/fleet/frpOrchestrator.ts` + `.test.ts`

Singleton supervisor. Exports:

```typescript
export interface FrpOrchestratorOpts {
  spawnImpl?: typeof import('node:child_process').spawn;
  binaryVersion?: string; // default '0.58.0'
  binaryCacheDir?: string; // default process.env.FLEET_BINARY_CACHE_DIR
  fetchImpl?: typeof fetch;
  fsImpl?: { existsSync; mkdirSync; writeFile };
  writeFileImpl?: (path, data) => Promise<void>;
  logEvent?: (entry) => Promise<void>; // defaults to FleetLogEvent.create
  reconcileIntervalMs?: number; // default 5000
  now?: () => Date;
}

export class FrpOrchestrator {
  constructor(opts?: FrpOrchestratorOpts);
  async reconcileOnce(): Promise<{
    action: 'none' | 'started' | 'stopped' | 'restarted' | 'error';
    detail?: string;
  }>;
  start(): void; // begin periodic reconcile
  stop(): Promise<void>; // graceful
  async applyRevision(revisionId: string): Promise<void>;
  currentState(): { runtimeState: ServiceState; pid?: number; configHash?: string };
}
```

Reconcile logic: read `FrpServerState.findOne({key:'global'})`. If `enabled===true` and no process running → download binary via `ensureBinary`, render TOML, write to `<cacheDir>/frps.toml`, `startFrps`. If `enabled===false` and process running → `kill`. On each log line, write FleetLogEvent with `service:'frps'`. Update `runtimeState` + `lastError` + `activeConnections` (parsed from stdout if available).

Tests: mock spawn + fetch + fs; exercise start/stop transitions; error paths.

### A2: `src/lib/fleet/nginxOrchestrator.ts` + `.test.ts`

```typescript
export class NginxOrchestrator {
  constructor(opts?: { spawnImpl?; fsImpl?; writeFileImpl?; logEvent? });
  async writeSnippet(slug: string, content: string): Promise<string>; // returns absolute path
  async removeSnippet(slug: string): Promise<void>;
  async applyAndReload(): Promise<{ ok: boolean; stderr: string }>;
  async listManagedSnippets(): Promise<string[]>;
}
```

Reads `NginxState.managedDir`, ensures directory exists, writes snippets as `<dir>/<slug>.conf`. `applyAndReload` runs `nginxTest` then `nginxReload`; updates NginxState timestamps + lastTestOutput.

Tests: mocked spawn + fs.

### A3: `src/lib/fleet/applyEngine.ts` + `.test.ts`

```typescript
export interface ApplyEngineDeps {
  frp: Pick<FrpOrchestrator, 'applyRevision' | 'reconcileOnce'>;
  nginx: Pick<NginxOrchestrator, 'writeSnippet' | 'removeSnippet' | 'applyAndReload'>;
}

export async function applyRevision(
  revisionId: string,
  deps: ApplyEngineDeps
): Promise<{ kind: string; reloaded: boolean; detail?: string }>;
```

Loads `ConfigRevision`, dispatches to frp orchestrator for `kind==='frps'|'frpc'` (marks revision.appliedAt=now) or nginx for `kind==='nginx'` (writes snippet + reload). Updates parent model (`FrpServerState.generatedConfigHash`, `PublicRoute.nginxConfigRevisionId`).

### A4: Wire into revisions API

Modify `src/app/api/fleet/revisions/[id]/rollback/route.ts` to call `applyRevision` after saving rollback. Modify routes that save revisions (node POST/PATCH, route POST/PATCH, frp POST/PATCH) to optionally auto-apply based on env `FLEET_AUTO_APPLY_REVISIONS=true`. If false, revisions save but don't apply until user clicks "Apply" on UI — add `src/app/api/fleet/revisions/[id]/apply/route.ts` POST that calls applyRevision.

## Wave B: Preflight executors + revision apply wiring

### B1: `src/lib/fleet/preflightExecutors.ts` + `.test.ts`

```typescript
export function createDefaultExecutors(opts: {
  netImpl?;
  dnsImpl?;
  fsImpl?;
  fetchImpl?;
  mongoConnect?;
  spawnImpl?;
}): PreflightExecutors;
```

Real implementations using `node:net`, `node:dns/promises`, `node:fs/promises`, `fetch`, `@/lib/db.connectDB`. Each can be injected for tests.

### B2: Wire into `/api/fleet/server/preflight`

Modify the route to import and use `createDefaultExecutors()` instead of empty `{}`.

### B3: `src/app/api/fleet/revisions/[id]/apply/route.ts` + `.test.ts`

POST endpoint that calls `applyRevision` through a lazy-initialized orchestrator bound to hub runtime.

## Wave C: TTY bridge protocol + hub Socket.IO namespace

### C1: `src/lib/fleet/tty-bridge.ts` + `.test.ts`

Protocol constants + Zod schemas:

```typescript
export const TTY_MSG = {
  OPEN: 'tty:open',
  CLOSE: 'tty:close',
  DATA: 'tty:data',
  RESIZE: 'tty:resize',
  ERROR: 'tty:error',
  EXIT: 'tty:exit',
} as const;

export const TtyOpenSchema = z.object({
  nodeId: z.string(),
  sessionId: z.string(),
  cols: z.number().int().min(10).max(500).default(80),
  rows: z.number().int().min(5).max(200).default(24),
  shell: z.string().optional(),
});

export const TtyDataSchema = z.object({ sessionId: z.string(), data: z.string() });
export const TtyResizeSchema = z.object({
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
});
```

Plus `AgentTtyClient` and `HubTtyBridge` classes that encapsulate the message routing.

### C2: `src/lib/fleet/hubTtyBridge.ts` + `.test.ts`

```typescript
export interface HubTtyBridgeDeps {
  resolveAgentEndpoint(nodeId: string): Promise<{ url: string; authToken: string } | null>;
  wsImpl?: typeof import('ws').WebSocket;
  now?: () => Date;
}

export class HubTtyBridge {
  constructor(deps: HubTtyBridgeDeps);
  async openSession(input: TtyOpen): Promise<{
    sessionId: string;
    send(data: string): void;
    resize(c, r): void;
    close(): void;
    onData(cb): void;
    onExit(cb): void;
  }>;
}
```

Establishes a WebSocket to the agent's local pty bridge (via FRP-tunneled remote port). Auth via per-node bearer token.

### C3: Hub namespace in `src/server.ts`

Add a new Socket.IO namespace `/api/fleet/tty`. On connection (requires same session-cookie auth), handle `TTY_MSG.OPEN` → `bridge.openSession(...)` → wire bidirectional data + resize + close events. Use `ws` package (already transitive via socket.io).

Tests: mock the namespace + WS client + bridge.

## Wave D: Agent-mode client + server.ts wiring

### D1: `src/lib/fleet/agentClient.ts` + `.test.ts`

```typescript
export interface AgentClientOpts {
  hubUrl: string;
  pairingToken: string;
  nodeId: string;
  binaryCacheDir?: string;
  ptyListenPort?: number; // default 8001
  heartbeatIntervalMs?: number; // default 30000
  spawnImpl?;
  fetchImpl?;
  ptyImpl?;
  wsServerImpl?;
}

export class AgentClient {
  constructor(opts: AgentClientOpts);
  async start(): Promise<void>; // pair -> download frpc -> write config -> spawn -> heartbeat loop -> pty bridge listener
  async stop(): Promise<void>;
  status(): { tunnelStatus; pid?; lastHeartbeatAt?; lastError? };
}
```

Steps in `start()`:

1. POST `<hubUrl>/api/fleet/nodes/<nodeId>/pair` with Bearer token, receive `{ hub: { serverAddr, serverPort, authToken, subdomainHost } }`
2. `ensureBinary` (frpc)
3. Render frpc.toml locally (uses node's own proxyRules from a GET /api/fleet/nodes/<nodeId> call? — for Phase 2, fetch the node's config once, then re-render on heartbeat-driven config changes)
4. Write config file under `<cacheDir>/frpc.toml`
5. `startFrpc`
6. Start local pty bridge WS server on `ptyListenPort`
7. Heartbeat loop: POST `<hubUrl>/api/fleet/nodes/<nodeId>/heartbeat` with current state every `heartbeatIntervalMs`

### D2: `src/lib/fleet/agentPtyBridge.ts` + `.test.ts`

Small WebSocket server that accepts TTY protocol messages, spawns `node-pty`, pipes data back. Uses `ws` package.

### D3: `src/server.ts` wiring

Add agent-mode branch:

```typescript
if (process.env.FLEET_AGENT_MODE === 'true') {
  const agent = new AgentClient({
    hubUrl: process.env.FLEET_AGENT_HUB_URL!,
    pairingToken: process.env.FLEET_AGENT_PAIRING_TOKEN!,
    nodeId: process.env.FLEET_AGENT_NODE_ID!,
  });
  await agent.start();
  // No Next.js server in agent mode
  return;
}
```

In hub mode, before `server.listen`, boot orchestrators:

```typescript
const frp = new FrpOrchestrator();
const nginx = new NginxOrchestrator();
frp.start(); // reconcile loop
registerFleetTtyNamespace(io, { frp, nginx });
```

Keep existing terminal Socket.IO logic untouched.

## Wave E: Final verification

- [ ] `pnpm format`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `git add -A && git commit -m "Fleet Management Phase 2 — tunnel runtime (orchestrators, apply engine, TTY bridge, agent mode)"`
