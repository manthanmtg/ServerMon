# Fleet ServerMon Guided Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Fleet node `ServerMon` tab that detects full ServerMon on the remote node, guides root install through the paired agent when missing, and optionally creates a public route such as `node-servermon.hub.example.com`.

**Architecture:** The hub exposes node-scoped ServerMon APIs and queues fixed agent commands. The agent reports read-only ServerMon status on heartbeat and executes only structured install/recheck/restart commands. The UI owns the guided flow and reuses the existing public route API after local health passes.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Mongoose models, Zod validation, Vitest, React Testing Library, existing Fleet command queue, existing PublicRoute/FRP/Nginx route pipeline.

---

### Task 1: ServerMon Status Data Path

**Files:**

- Create: `src/lib/fleet/servermonStatus.ts`
- Test: `src/lib/fleet/servermonStatus.test.ts`
- Modify: `src/lib/fleet/heartbeat.ts`
- Modify: `src/models/Node.ts`
- Modify: `src/app/api/fleet/nodes/[id]/heartbeat/route.ts`
- Test: `src/app/api/fleet/nodes/[id]/heartbeat/route.test.ts`

- [ ] **Step 1: Write status helper tests**

Create tests for parsing `systemctl show`, parsing `/etc/servermon/env`, building a default status, and producing a healthy status when the local health probe succeeds.

Run: `pnpm vitest src/lib/fleet/servermonStatus.test.ts`

Expected: FAIL because `servermonStatus.ts` does not exist.

- [ ] **Step 2: Implement status helpers**

Add exported types:

```ts
export type ServerMonServiceState = 'running' | 'stopped' | 'failed' | 'unknown' | 'missing';
export type ServerMonHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface ServerMonStatus {
  installed: boolean;
  serviceName: string;
  serviceState: ServerMonServiceState;
  serviceEnabled: boolean | 'unknown';
  port: number;
  installDir?: string;
  healthUrl: string;
  healthStatus: ServerMonHealthStatus;
  version?: string;
  lastCheckedAt: string;
  lastError?: string;
}
```

Implement:

```ts
export function parseServerMonEnv(raw: string | undefined): { port: number };
export function parseSystemctlShow(raw: string): {
  installed: boolean;
  serviceState: ServerMonServiceState;
  serviceEnabled: boolean | 'unknown';
  installDir?: string;
};
export async function collectServerMonStatus(opts: {
  spawnImpl?: typeof import('node:child_process').spawn;
  fetchImpl?: typeof fetch;
  readFile?: (path: string, encoding: 'utf8') => Promise<string>;
  now?: () => Date;
}): Promise<ServerMonStatus>;
```

- [ ] **Step 3: Extend heartbeat and Node schema**

Add optional `servermon` to `HeartbeatZodSchema`. Add `servermon?: ServerMonStatus` to `INode`, `NodeZodSchema`, and `NodeSchema`.

- [ ] **Step 4: Persist status on heartbeat**

In heartbeat route, when `hb.servermon` exists, set `servermon` in the node update. Add a test that a heartbeat containing `servermon.installed=true` persists the status.

Run: `pnpm vitest src/lib/fleet/servermonStatus.test.ts src/app/api/fleet/nodes/[id]/heartbeat/route.test.ts`

Expected: PASS.

### Task 2: Command Secret Storage And ServerMon APIs

**Files:**

- Create: `src/models/FleetCommandSecret.ts`
- Create: `src/lib/fleet/commandSecrets.ts`
- Test: `src/lib/fleet/commandSecrets.test.ts`
- Create: `src/lib/fleet/servermonInstall.ts`
- Test: `src/lib/fleet/servermonInstall.test.ts`
- Create: `src/app/api/fleet/nodes/[id]/servermon/route.ts`
- Create: `src/app/api/fleet/nodes/[id]/servermon/install/route.ts`
- Create: `src/app/api/fleet/nodes/[id]/servermon/recheck/route.ts`
- Create: `src/app/api/fleet/nodes/[id]/servermon/restart/route.ts`
- Test: `src/app/api/fleet/nodes/[id]/servermon/install/route.test.ts`
- Modify: `src/app/api/fleet/nodes/[id]/heartbeat/route.ts`

- [ ] **Step 1: Write command secret tests**

Cover encrypt/decrypt round-trip and hydration of an `install-servermon` pending command without storing raw MongoDB URI in `pendingCommands`.

Run: `pnpm vitest src/lib/fleet/commandSecrets.test.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 2: Implement encrypted command secrets**

Use AES-256-GCM with a key derived from `FLEET_COMMAND_SECRET_KEY`, then `JWT_SECRET`, then `FLEET_HUB_AUTH_TOKEN`. Store encrypted JSON in `FleetCommandSecret` with `commandId`, `nodeId`, `iv`, `tag`, `ciphertext`, and `expiresAt`.

Export:

```ts
export async function storeCommandSecret(input: {
  commandId: string;
  nodeId: string;
  payload: Record<string, unknown>;
  expiresAt?: Date;
}): Promise<void>;

export async function hydrateCommandSecrets(
  nodeId: string,
  commands: Array<{ id: string; command: string; args?: unknown }>
): Promise<Array<{ id: string; command: string; args?: unknown }>>;
```

- [ ] **Step 3: Write install payload helper tests**

Cover default route payload generation, domain conflict prevalidation shape, install command args redaction, and request validation for port/MongoDB URI.

- [ ] **Step 4: Implement install helpers**

Add Zod schemas and helpers for:

```ts
export const ServerMonInstallRequestZ;
export function redactInstallArgs(args: unknown): unknown;
export function buildDefaultServerMonRouteIntent(input: {
  nodeId: string;
  nodeName: string;
  nodeSlug: string;
  port: number;
  subdomainHost?: string | null;
}): ServerMonRouteIntent;
```

- [ ] **Step 5: Add node ServerMon GET API**

`GET /api/fleet/nodes/[id]/servermon` returns node ServerMon status, computed install availability, matching public route, and default route intent.

- [ ] **Step 6: Add install/recheck/restart APIs**

`POST /install` validates admin RBAC, rejects offline/unpaired nodes, creates encrypted MongoDB URI secret, queues `install-servermon`, writes redacted Fleet logs/audit, and returns `{ ok, queued, commandId, routeIntent }`.

`POST /recheck` queues `servermon-recheck`.

`POST /restart` queues `servermon-restart`.

- [ ] **Step 7: Hydrate command secrets in heartbeat**

Before returning pending commands from the heartbeat route, call `hydrateCommandSecrets(id, commands)`. Then clear pending commands as today.

Run: `pnpm vitest src/lib/fleet/commandSecrets.test.ts src/lib/fleet/servermonInstall.test.ts src/app/api/fleet/nodes/[id]/servermon/install/route.test.ts src/app/api/fleet/nodes/[id]/heartbeat/route.test.ts`

Expected: PASS.

### Task 3: Agent Command Execution

**Files:**

- Create: `src/lib/fleet/servermonAgentCommands.ts`
- Test: `src/lib/fleet/servermonAgentCommands.test.ts`
- Modify: `src/lib/fleet/agentClient.ts`
- Test: `src/lib/fleet/agentClient.test.ts`

- [ ] **Step 1: Write command helper tests**

Cover fixed install command construction, omission of `--skip-mongo` when local MongoDB is requested, MongoDB URI redaction, and rejection when `mongoUri` is missing.

- [ ] **Step 2: Implement command helpers**

Export:

```ts
export function buildInstallServerMonCommand(args: {
  mongoUri: string;
  port: number;
  skipMongo: boolean;
  allowRoot: boolean;
  sourceDir?: string;
}): string[];

export function redactServerMonInstallText(input: string, mongoUri?: string): string;
```

Use `spawn('bash', ['-lc', command])` and pass `MONGO_URI`/`PORT` through environment where possible.

- [ ] **Step 3: Include status in heartbeat**

In `AgentClient.sendHeartbeat()`, call `collectServerMonStatus()` and add `servermon` to the heartbeat body.

- [ ] **Step 4: Handle install/recheck/restart commands**

Add handlers:

- `install-servermon`: run fixed installer command, log redacted output, force heartbeat after completion.
- `servermon-recheck`: force heartbeat.
- `servermon-restart`: run `systemctl restart servermon`, then force heartbeat.

Run: `pnpm vitest src/lib/fleet/servermonAgentCommands.test.ts src/lib/fleet/agentClient.test.ts`

Expected: PASS.

### Task 4: ServerMon Tab UI

**Files:**

- Create: `src/modules/fleet/ui/details/NodeServerMonPanel.tsx`
- Test: `src/modules/fleet/ui/details/NodeServerMonPanel.test.tsx`
- Modify: `src/app/fleet/[slug]/page.tsx`
- Test: `src/app/fleet/[slug]/page.test.tsx`

- [ ] **Step 1: Write UI tests**

Cover installed status rendering, not-installed wizard rendering, validation for missing MongoDB URI, install submit to `/servermon/install`, and route creation through `/api/fleet/routes` after healthy install when public route is enabled.

- [ ] **Step 2: Implement panel**

The panel fetches `/api/fleet/nodes/[id]/servermon`, shows installed cards when `servermon.installed` is true, otherwise shows a compact wizard with MongoDB URI, port, skip-local-Mongo checkbox, and optional public route checkbox/domain.

- [ ] **Step 3: Add tab**

Add `servermon` to the node detail page tab union and render `NodeServerMonPanel`.

Run: `pnpm vitest src/modules/fleet/ui/details/NodeServerMonPanel.test.tsx src/app/fleet/[slug]/page.test.tsx`

Expected: PASS.

### Task 5: Focused Verification

**Files:**

- All files modified above.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
pnpm vitest \
  src/lib/fleet/servermonStatus.test.ts \
  src/lib/fleet/commandSecrets.test.ts \
  src/lib/fleet/servermonInstall.test.ts \
  src/lib/fleet/servermonAgentCommands.test.ts \
  src/lib/fleet/agentClient.test.ts \
  src/app/api/fleet/nodes/[id]/heartbeat/route.test.ts \
  src/app/api/fleet/nodes/[id]/servermon/install/route.test.ts \
  src/modules/fleet/ui/details/NodeServerMonPanel.test.tsx \
  src/app/fleet/[slug]/page.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run lint on touched source**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 4: Commit**

Commit all implementation and plan changes with:

```bash
git add docs/superpowers/plans/2026-04-29-fleet-servermon-guided-install.md src
git commit -m "feat: add fleet servermon guided install"
```
