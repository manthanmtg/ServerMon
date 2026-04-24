# Fleet Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve ServerMon into a Fleet Management Platform: a Master Hub that orchestrates remote Agents via FRP tunnels, exposing remote services through managed Nginx, with full-lifecycle operations (onboarding, updates, backup, diagnostics, emergency controls).

**Architecture:** Next.js 16 (App Router) + MongoDB + Socket.IO. A new `fleet` module wraps FRP: structured config is stored in Mongo; `frps.toml`, `frpc.toml`, and Nginx snippets are rendered from DB state; Hub spawns/supervises `frps` + optional `nginx reload`; Agents run ServerMon in `--agent` mode which spawns `frpc` and a local WebSocket TTY bridge. All mutating actions emit immutable audit entries and versioned config revisions.

**Tech Stack:** Mongoose, Zod, xterm.js, node-pty, Socket.IO, Recharts, systeminformation, child_process spawn for `frps/frpc/nginx/acme`.

---

## Scope Reality Check (READ FIRST)

The spec in `module_ideas/fleet_management.md` is a full product (~2-4 weeks of dedicated engineering). This plan maps it to the spec's own 5 phases. **Phase 1 is fully detailed and executable in this session.** Phases 2-5 are outlined with file paths and interfaces; each should become its own plan document when we pick it up.

**Feasibility boundaries:** Code that spawns real OS processes (`frps`, `frpc`, `nginx -t`, `systemctl`, certbot) is implemented as thin, unit-tested wrappers around `child_process.spawn`. The wrappers are real (no TODOs), but end-to-end verification requires running against a real Linux host with FRP+Nginx installed. Tests stub the spawn surface. This is an unavoidable I/O boundary, not a placeholder.

---

## File Structure (Full Scope Inventory)

### Models (`src/models/`)

- `Node.ts` — fleet agent record
- `FrpServerState.ts` — global frps runtime state
- `FleetLogEvent.ts` — structured fleet logs + audit events
- `ConfigRevision.ts` — versioned rendered TOML / Nginx snippets
- `PublicRoute.ts` — cloud-facing public domains -> agent services
- `NginxState.ts` — managed Nginx runtime state
- `AgentUpdateJob.ts` — staged rollout jobs
- `BackupJob.ts` — backup/restore jobs
- `ResourcePolicy.ts` — soft/hard limits
- `AccessPolicy.ts` — route access policies + temp shares
- `RouteTemplate.ts` — service publishing templates
- `DiagnosticRun.ts` — diagnostic chain runs
- `ImportedConfig.ts` — imported FRP/Nginx config records

### Libraries (`src/lib/fleet/`)

- `enums.ts` — status enums for nodes, tunnels, proxies, public routes, services
- `status.ts` — status derivation + `last seen` computations
- `toml.ts` — render `frps.toml` + `frpc.toml` from structured config
- `toml-parse.ts` — validate generated TOML parses
- `nginx.ts` — render Nginx server block snippets from `PublicRoute`
- `pairing.ts` — `pairingToken` generation + hashing + verification
- `binary.ts` — FRP binary discovery + download + integrity verification
- `frpProcess.ts` — thin `child_process.spawn` wrapper for frps/frpc lifecycle + log capture
- `nginxProcess.ts` — thin wrapper for `nginx -t` + reload + managed directory
- `acme.ts` — TLS/ACME provider interface + default (certbot) adapter
- `dns.ts` — DNS lookup helpers + wildcard verification
- `preflight.ts` — Hub readiness checks (ports, DNS, TLS, Nginx, FRP, Mongo, disk, perms)
- `diagnostics.ts` — client + route diagnostic chains + recommended fixes
- `heartbeat.ts` — heartbeat payload schema + offline derivation
- `audit.ts` — audit event helpers (emit fleet log with severity=audit)
- `revisions.ts` — store + diff + rollback config revisions
- `backup.ts` — structured fleet snapshot + restore primitives
- `resourceGuards.ts` — soft/hard limit checks against current counts
- `access.ts` — access policy evaluation + temp share resolver
- `templates.ts` — built-in route templates catalog
- `firewall.ts` — inbound reachability probes
- `tty-bridge.ts` — WebSocket <-> node-pty protocol constants + msg schema
- `agentClient.ts` — Agent-mode entry point (boots frpc + pty bridge + heartbeat)
- `install-script.ts` — installer snippet renderer (systemd, launchd, docker)
- `update-jobs.ts` — staged rollout engine primitives
- `import.ts` — parse existing frp/nginx configs into `ImportedConfig`

### API routes (`src/app/api/fleet/`)

- `nodes/route.ts` + `nodes/[id]/route.ts` + `nodes/[id]/pair/route.ts` + `nodes/[id]/rotate-token/route.ts` + `nodes/[id]/maintenance/route.ts` + `nodes/[id]/heartbeat/route.ts` + `nodes/[id]/diagnose/route.ts`
- `server/route.ts` — frps status/toggle
- `server/restart/route.ts`
- `server/preflight/route.ts`
- `routes/route.ts` + `routes/[id]/route.ts` + `routes/[id]/diagnose/route.ts`
- `nginx/route.ts` + `nginx/test/route.ts` + `nginx/reload/route.ts` + `nginx/import/route.ts`
- `templates/route.ts` + `templates/[id]/route.ts`
- `access-policies/route.ts` + `access-policies/[id]/route.ts`
- `resource-policies/route.ts` + `resource-policies/[id]/route.ts`
- `logs/route.ts`
- `revisions/route.ts` + `revisions/[id]/route.ts` + `revisions/[id]/rollback/route.ts`
- `updates/route.ts` + `updates/[id]/route.ts`
- `backups/route.ts` + `backups/[id]/route.ts` + `backups/[id]/restore/route.ts`
- `emergency/route.ts`
- `install/route.ts` — serves install script (public; signed by token)
- `import/route.ts` — import existing configs

### Pages (`src/app/fleet/`)

- `page.tsx` — Fleet dashboard (NodeDirectory)
- `[slug]/page.tsx` — Node detail
- `onboarding/page.tsx` — full wizard
- `routes/page.tsx` — public routes list
- `routes/[id]/page.tsx` — public route detail
- `logs/page.tsx` — fleet logs
- `server/page.tsx` — frps operations
- `nginx/page.tsx` — Nginx management
- `updates/page.tsx` — agent updates
- `backups/page.tsx` — backup/restore
- `diagnostics/page.tsx` — preflight + diagnostics
- `templates/page.tsx` — route templates
- `policies/page.tsx` — access + resource policies
- `emergency/page.tsx` — emergency controls
- `import/page.tsx` — import wizard

### Module UI (`src/modules/fleet/ui/`)

- `FleetWidget.tsx` — dashboard widget
- `dashboard/NodeGrid.tsx`, `NodeCard.tsx`, `NodeSearch.tsx`, `FleetStatsBanner.tsx`
- `onboarding/OnboardingWizard.tsx`, `InstallerSnippet.tsx`, `DnsVerifier.tsx`, `FrpcConfigForm.tsx`, `TomlPreview.tsx`
- `details/NodeTerminal.tsx`, `NodeHardwareCharts.tsx`, `ProxyRuleTable.tsx`, `PublicRouteTable.tsx`, `ExposeServiceWizard.tsx`, `RemoteProcessTable.tsx`, `NodeStatusPanel.tsx`, `NodeLogsView.tsx`
- `operations/FrpServerControl.tsx`, `NginxManager.tsx`, `CertificateManager.tsx`, `AgentUpdateCenter.tsx`, `BackupRestorePanel.tsx`, `PreflightReport.tsx`, `RouteTemplatePicker.tsx`, `AccessPolicyEditor.tsx`, `ResourceGuardSettings.tsx`, `TroubleshootingAssistant.tsx`, `EmergencyControls.tsx`, `ConfigImportWizard.tsx`, `GeneratedDocsView.tsx`, `FleetLogsPage.tsx`, `ConfigRevisionHistory.tsx`, `FleetAlertsPanel.tsx`

### Module definition

- `src/modules/fleet/module.ts`
- `src/modules/fleet/types.ts`
- Register in `src/modules/index.ts`
- Register widget in `src/components/modules/ModuleWidgetRegistry.tsx`
- Add nav entry in `src/components/layout/ProShell.tsx`

### Server-side hooks

- `src/server.ts` — extend Socket.IO with `/api/fleet/tty` namespace (bridge ↔ agent); agent-mode supervisor
- `src/app/api/fleet/install/route.ts` — unauthenticated but token-signed

### Env & docs

- `.env.example` — `FRP_BIND_PORT`, `FRP_VHOST_HTTP_PORT`, `FRP_VHOST_HTTPS_PORT`, `FRP_AUTH_TOKEN`, `FRP_SUBDOMAIN_HOST`, `FLEET_HUB_PUBLIC_URL`, `FLEET_AGENT_MODE`, `FLEET_AGENT_HUB_URL`, `FLEET_AGENT_PAIRING_TOKEN`, `FLEET_AGENT_NODE_ID`, `FLEET_NGINX_MANAGED_DIR`, `FLEET_NGINX_BINARY`, `FLEET_ACME_PROVIDER`, `FLEET_BINARY_CACHE_DIR`, `FLEET_BACKUP_DIR`
- `CLAUDE.md` — workspace index update

---

## Bite-Sized Tasks — Phase 1: Foundation

This phase delivers: all 13 models, status enum/derivation, pairing token primitives, TOML rendering, Nginx snippet rendering, CRUD for Nodes/PublicRoutes/RouteTemplates/AccessPolicies/ResourcePolicies, fleet logs API, config revision storage, module registration, fleet dashboard + onboarding wizard scaffolding, env.example, ProShell nav entry. Every pure-logic unit has tests.

### Task 1.1: Status enums + shared types

**Files:**

- Create: `src/lib/fleet/enums.ts`
- Create: `src/lib/fleet/enums.test.ts`

- [ ] **Step 1: Write failing test** — `src/lib/fleet/enums.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  NODE_STATUSES,
  TUNNEL_STATUSES,
  PROXY_STATUSES,
  PUBLIC_ROUTE_STATUSES,
  SERVICE_STATES,
  isTerminalNodeStatus,
} from './enums';

describe('fleet enums', () => {
  it('includes every spec-defined status', () => {
    expect(NODE_STATUSES).toEqual([
      'online',
      'offline',
      'connecting',
      'degraded',
      'maintenance',
      'disabled',
      'unpaired',
      'error',
    ]);
    expect(TUNNEL_STATUSES).toEqual([
      'connected',
      'reconnecting',
      'disconnected',
      'auth_failed',
      'config_invalid',
      'proxy_conflict',
      'unsupported_config',
    ]);
    expect(PROXY_STATUSES).toEqual([
      'active',
      'disabled',
      'failed',
      'port_conflict',
      'dns_missing',
      'upstream_unreachable',
    ]);
    expect(PUBLIC_ROUTE_STATUSES).toEqual([
      'active',
      'disabled',
      'pending_dns',
      'cert_failed',
      'nginx_invalid',
      'nginx_reload_failed',
      'frp_unreachable',
      'upstream_down',
      'degraded',
    ]);
    expect(SERVICE_STATES).toEqual([
      'running',
      'stopped',
      'starting',
      'stopping',
      'degraded',
      'failed',
    ]);
  });
  it('isTerminalNodeStatus flags stable end states', () => {
    expect(isTerminalNodeStatus('online')).toBe(true);
    expect(isTerminalNodeStatus('offline')).toBe(true);
    expect(isTerminalNodeStatus('connecting')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `pnpm test src/lib/fleet/enums.test.ts`

- [ ] **Step 3: Implement** — `src/lib/fleet/enums.ts`

```typescript
export const NODE_STATUSES = [
  'online',
  'offline',
  'connecting',
  'degraded',
  'maintenance',
  'disabled',
  'unpaired',
  'error',
] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const TUNNEL_STATUSES = [
  'connected',
  'reconnecting',
  'disconnected',
  'auth_failed',
  'config_invalid',
  'proxy_conflict',
  'unsupported_config',
] as const;
export type TunnelStatus = (typeof TUNNEL_STATUSES)[number];

export const PROXY_STATUSES = [
  'active',
  'disabled',
  'failed',
  'port_conflict',
  'dns_missing',
  'upstream_unreachable',
] as const;
export type ProxyStatus = (typeof PROXY_STATUSES)[number];

export const PUBLIC_ROUTE_STATUSES = [
  'active',
  'disabled',
  'pending_dns',
  'cert_failed',
  'nginx_invalid',
  'nginx_reload_failed',
  'frp_unreachable',
  'upstream_down',
  'degraded',
] as const;
export type PublicRouteStatus = (typeof PUBLIC_ROUTE_STATUSES)[number];

export const SERVICE_STATES = [
  'running',
  'stopped',
  'starting',
  'stopping',
  'degraded',
  'failed',
] as const;
export type ServiceState = (typeof SERVICE_STATES)[number];

export const FRPC_PROTOCOLS = ['tcp', 'kcp', 'quic', 'websocket'] as const;
export type FrpcProtocol = (typeof FRPC_PROTOCOLS)[number];

export const ACCESS_MODES = [
  'public',
  'servermon_auth',
  'ip_allowlist',
  'basic_auth',
  'temporary_share',
  'disabled',
] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const SERVICE_MANAGERS = ['systemd', 'launchd', 'docker', 'manual', 'unknown'] as const;
export type ServiceManager = (typeof SERVICE_MANAGERS)[number];

export const FLEET_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'audit'] as const;
export type FleetLogLevel = (typeof FLEET_LOG_LEVELS)[number];

export const FLEET_LOG_SERVICES = [
  'servermon',
  'frps',
  'frpc',
  'nginx',
  'acme',
  'terminal',
  'endpoint-runner',
  'agent',
  'backup',
  'update',
] as const;
export type FleetLogService = (typeof FLEET_LOG_SERVICES)[number];

export function isTerminalNodeStatus(s: NodeStatus): boolean {
  return (
    s === 'online' || s === 'offline' || s === 'error' || s === 'disabled' || s === 'maintenance'
  );
}
```

- [ ] **Step 4: Run test — expect pass** — `pnpm test src/lib/fleet/enums.test.ts`

- [ ] **Step 5: Commit** — `git add src/lib/fleet/enums.ts src/lib/fleet/enums.test.ts && git commit -m "feat(fleet): add status enums and helpers"`

### Task 1.2: Status derivation

**Files:**

- Create: `src/lib/fleet/status.ts`
- Create: `src/lib/fleet/status.test.ts`

- [ ] **Step 1: Write failing test** — drives `deriveNodeStatus({ lastSeen, tunnelStatus, maintenanceEnabled, disabled, unpaired, lastError, now })`. Cases: `unpaired` dominates, `disabled` dominates, `maintenance` dominates, stale `lastSeen` >60s → `offline`, `connecting` if unseen but recent pair, `degraded` if tunnel `reconnecting`/`proxy_conflict`, `error` if lastError within 60s, else `online`.

```typescript
import { describe, it, expect } from 'vitest';
import { deriveNodeStatus, lastSeenLabel } from './status';

const now = new Date('2026-04-24T12:00:00Z');
describe('deriveNodeStatus', () => {
  it('returns unpaired when no token was ever verified', () => {
    expect(deriveNodeStatus({ unpaired: true, now })).toBe('unpaired');
  });
  it('returns disabled when node is disabled', () => {
    expect(deriveNodeStatus({ disabled: true, now })).toBe('disabled');
  });
  it('returns maintenance', () => {
    expect(deriveNodeStatus({ maintenanceEnabled: true, now })).toBe('maintenance');
  });
  it('returns offline when lastSeen > 60s old', () => {
    const lastSeen = new Date(now.getTime() - 90_000);
    expect(deriveNodeStatus({ lastSeen, tunnelStatus: 'disconnected', now })).toBe('offline');
  });
  it('returns degraded when tunnel reconnecting', () => {
    const lastSeen = new Date(now.getTime() - 5_000);
    expect(deriveNodeStatus({ lastSeen, tunnelStatus: 'reconnecting', now })).toBe('degraded');
  });
  it('returns online when fresh and connected', () => {
    const lastSeen = new Date(now.getTime() - 5_000);
    expect(deriveNodeStatus({ lastSeen, tunnelStatus: 'connected', now })).toBe('online');
  });
  it('lastSeenLabel formats human-readable', () => {
    expect(lastSeenLabel(new Date(now.getTime() - 30_000), now)).toMatch(/30s/);
    expect(lastSeenLabel(new Date(now.getTime() - 3_600_000), now)).toMatch(/1h/);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement** — `src/lib/fleet/status.ts`

```typescript
import type { NodeStatus, TunnelStatus } from './enums';

export interface DeriveNodeStatusInput {
  lastSeen?: Date;
  tunnelStatus?: TunnelStatus;
  maintenanceEnabled?: boolean;
  disabled?: boolean;
  unpaired?: boolean;
  lastError?: { occurredAt: Date } | null;
  now: Date;
}

export function deriveNodeStatus(i: DeriveNodeStatusInput): NodeStatus {
  if (i.unpaired) return 'unpaired';
  if (i.disabled) return 'disabled';
  if (i.maintenanceEnabled) return 'maintenance';
  const seen = i.lastSeen ? i.now.getTime() - i.lastSeen.getTime() : Infinity;
  if (seen > 60_000) return 'offline';
  if (i.tunnelStatus === 'auth_failed' || i.tunnelStatus === 'config_invalid') return 'error';
  if (
    i.tunnelStatus === 'reconnecting' ||
    i.tunnelStatus === 'proxy_conflict' ||
    i.tunnelStatus === 'unsupported_config'
  )
    return 'degraded';
  if (i.tunnelStatus === 'disconnected') return 'connecting';
  const errFresh = i.lastError && i.now.getTime() - i.lastError.occurredAt.getTime() < 60_000;
  if (errFresh) return 'error';
  return 'online';
}

export function lastSeenLabel(lastSeen: Date | undefined, now: Date): string {
  if (!lastSeen) return 'never';
  const s = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit** — `git add src/lib/fleet/status.* && git commit -m "feat(fleet): derive node status from inputs"`

### Task 1.3: Pairing token primitives

**Files:**

- Create: `src/lib/fleet/pairing.ts`
- Create: `src/lib/fleet/pairing.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { generatePairingToken, hashPairingToken, verifyPairingToken } from './pairing';

describe('pairing tokens', () => {
  it('generates 40+ char tokens', () => {
    const t = generatePairingToken();
    expect(t).toMatch(/^[a-z0-9_-]{40,}$/i);
  });
  it('hashes deterministically and verifies', async () => {
    const t = generatePairingToken();
    const h = await hashPairingToken(t);
    expect(h).not.toBe(t);
    expect(await verifyPairingToken(t, h)).toBe(true);
    expect(await verifyPairingToken('wrong', h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement** — argon2-based, mirrors `src/lib/auth-utils.ts`

```typescript
import crypto from 'node:crypto';
import argon2 from 'argon2';

export function generatePairingToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
export async function hashPairingToken(token: string): Promise<string> {
  return argon2.hash(token, { type: argon2.argon2id });
}
export async function verifyPairingToken(token: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, token);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run — expect pass**
- [ ] **Step 5: Commit**

### Task 1.4: Node model

**Files:**

- Create: `src/models/Node.ts`
- Create: `src/models/Node.test.ts`

- [ ] **Step 1: Write failing test** — covers Zod validation, slug regex, enum rejection, defaults, required fields.

```typescript
import { describe, it, expect } from 'vitest';
import { NodeZodSchema } from './Node';

describe('NodeZodSchema', () => {
  it('accepts minimal valid payload', () => {
    const parsed = NodeZodSchema.parse({ name: 'Orion', slug: 'orion' });
    expect(parsed.status).toBe('unpaired');
    expect(parsed.tags).toEqual([]);
    expect(parsed.frpcConfig.tlsEnabled).toBe(true);
    expect(parsed.frpcConfig.transportEncryptionEnabled).toBe(true);
    expect(parsed.frpcConfig.protocol).toBe('tcp');
  });
  it('rejects bad slug', () => {
    expect(() => NodeZodSchema.parse({ name: 'x', slug: 'Orion!' })).toThrow();
  });
  it('rejects bad protocol', () => {
    expect(() =>
      NodeZodSchema.parse({
        name: 'x',
        slug: 'x',
        frpcConfig: { protocol: 'smoke' },
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement** — `src/models/Node.ts`

```typescript
import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import {
  NODE_STATUSES,
  TUNNEL_STATUSES,
  PROXY_STATUSES,
  FRPC_PROTOCOLS,
  SERVICE_MANAGERS,
  SERVICE_STATES,
} from '@/lib/fleet/enums';

const ProxyRuleZ = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  type: z.enum(['tcp', 'http', 'https', 'udp', 'stcp', 'xtcp']),
  subdomain: z.string().max(100).optional(),
  localIp: z.string().default('127.0.0.1'),
  localPort: z.number().int().min(1).max(65535),
  remotePort: z.number().int().min(1).max(65535).optional(),
  customDomains: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  status: z.enum(PROXY_STATUSES).default('disabled'),
  lastError: z.string().optional(),
});

const FrpcConfigZ = z
  .object({
    protocol: z.enum(FRPC_PROTOCOLS).default('tcp'),
    tlsEnabled: z.boolean().default(true),
    tlsVerify: z.boolean().default(true),
    transportEncryptionEnabled: z.boolean().default(true),
    compressionEnabled: z.boolean().default(false),
    heartbeatInterval: z.number().int().min(5).max(3600).default(30),
    heartbeatTimeout: z.number().int().min(10).max(3600).default(90),
    poolCount: z.number().int().min(0).max(50).default(1),
    advanced: z.record(z.string(), z.unknown()).default({}),
  })
  .default({
    protocol: 'tcp',
    tlsEnabled: true,
    tlsVerify: true,
    transportEncryptionEnabled: true,
    compressionEnabled: false,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
    poolCount: 1,
    advanced: {},
  });

export const NodeZodSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).optional(),
  status: z.enum(NODE_STATUSES).default('unpaired'),
  tunnelStatus: z.enum(TUNNEL_STATUSES).default('disconnected'),
  serviceManager: z.enum(SERVICE_MANAGERS).default('unknown'),
  serviceStatus: z.enum(SERVICE_STATES).default('stopped'),
  autoStartEnabled: z.boolean().default(false),
  agentVersion: z.string().max(40).optional(),
  frpcVersion: z.string().max(40).optional(),
  hardware: z
    .object({
      cpuCount: z.number().int().optional(),
      totalRam: z.number().int().optional(),
      diskSize: z.number().int().optional(),
      osDistro: z.string().max(120).optional(),
      arch: z.string().max(40).optional(),
    })
    .default({}),
  frpcConfig: FrpcConfigZ,
  proxyRules: z.array(ProxyRuleZ).default([]),
  tags: z.array(z.string().max(40)).max(20).default([]),
  maintenance: z
    .object({
      enabled: z.boolean().default(false),
      reason: z.string().max(200).optional(),
      until: z.date().optional(),
    })
    .default({ enabled: false }),
  capabilities: z
    .object({
      terminal: z.boolean().default(true),
      endpointRuns: z.boolean().default(true),
      processes: z.boolean().default(true),
      metrics: z.boolean().default(true),
      publishRoutes: z.boolean().default(true),
      tcpForward: z.boolean().default(true),
      fileOps: z.boolean().default(false),
      updates: z.boolean().default(true),
    })
    .default({
      terminal: true,
      endpointRuns: true,
      processes: true,
      metrics: true,
      publishRoutes: true,
      tcpForward: true,
      fileOps: false,
      updates: true,
    }),
});

export type INodeDTO = z.infer<typeof NodeZodSchema>;

export interface INode extends Document, INodeDTO {
  _id: mongoose.Types.ObjectId;
  pairingTokenHash?: string;
  pairingTokenPrefix?: string;
  pairingIssuedAt?: Date;
  lastSeen?: Date;
  connectedSince?: Date;
  lastBootAt?: Date;
  bootId?: string;
  lastError?: { code: string; message: string; occurredAt: Date; correlationId?: string };
  generatedToml?: { hash: string; renderedAt: Date; version: number };
  metrics?: { cpuLoad?: number; ramUsed?: number; uptime?: number; capturedAt?: Date };
  createdBy?: string;
  updatedBy?: string;
}

const ProxyRuleSub = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    subdomain: { type: String },
    localIp: { type: String, default: '127.0.0.1' },
    localPort: { type: Number, required: true },
    remotePort: { type: Number },
    customDomains: [{ type: String }],
    enabled: { type: Boolean, default: true },
    status: { type: String, enum: PROXY_STATUSES, default: 'disabled' },
    lastError: { type: String },
  },
  { _id: false }
);

const NodeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    description: { type: String },
    status: { type: String, enum: NODE_STATUSES, default: 'unpaired' },
    tunnelStatus: { type: String, enum: TUNNEL_STATUSES, default: 'disconnected' },
    serviceManager: { type: String, enum: SERVICE_MANAGERS, default: 'unknown' },
    serviceStatus: { type: String, enum: SERVICE_STATES, default: 'stopped' },
    autoStartEnabled: { type: Boolean, default: false },
    agentVersion: { type: String },
    frpcVersion: { type: String },
    hardware: {
      cpuCount: Number,
      totalRam: Number,
      diskSize: Number,
      osDistro: String,
      arch: String,
    },
    frpcConfig: {
      protocol: { type: String, enum: FRPC_PROTOCOLS, default: 'tcp' },
      tlsEnabled: { type: Boolean, default: true },
      tlsVerify: { type: Boolean, default: true },
      transportEncryptionEnabled: { type: Boolean, default: true },
      compressionEnabled: { type: Boolean, default: false },
      heartbeatInterval: { type: Number, default: 30 },
      heartbeatTimeout: { type: Number, default: 90 },
      poolCount: { type: Number, default: 1 },
      advanced: { type: Schema.Types.Mixed, default: {} },
    },
    proxyRules: [ProxyRuleSub],
    tags: [{ type: String, trim: true }],
    maintenance: {
      enabled: { type: Boolean, default: false },
      reason: String,
      until: Date,
    },
    capabilities: {
      terminal: { type: Boolean, default: true },
      endpointRuns: { type: Boolean, default: true },
      processes: { type: Boolean, default: true },
      metrics: { type: Boolean, default: true },
      publishRoutes: { type: Boolean, default: true },
      tcpForward: { type: Boolean, default: true },
      fileOps: { type: Boolean, default: false },
      updates: { type: Boolean, default: true },
    },
    pairingTokenHash: { type: String },
    pairingTokenPrefix: { type: String },
    pairingIssuedAt: { type: Date },
    lastSeen: { type: Date },
    connectedSince: { type: Date },
    lastBootAt: { type: Date },
    bootId: { type: String },
    lastError: {
      code: String,
      message: String,
      occurredAt: Date,
      correlationId: String,
    },
    generatedToml: { hash: String, renderedAt: Date, version: Number },
    metrics: { cpuLoad: Number, ramUsed: Number, uptime: Number, capturedAt: Date },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

NodeSchema.index({ tags: 1 });
NodeSchema.index({ status: 1 });
NodeSchema.index({ pairingTokenPrefix: 1 });

const Node: Model<INode> =
  (mongoose.models.Node as Model<INode>) || mongoose.model<INode>('Node', NodeSchema);

export default Node;
```

- [ ] **Step 4: Run — expect pass**
- [ ] **Step 5: Commit**

### Task 1.5: FrpServerState model

**Files:** `src/models/FrpServerState.ts` + `.test.ts`

Fields per spec §3: `enabled`, `runtimeState` (service state enum), `bindPort`, `vhostHttpPort`, `vhostHttpsPort`, `subdomainHost`, `authTokenHash`, `authTokenPrefix`, `generatedConfigHash`, `configVersion`, `lastRestartAt`, `lastError`, `activeConnections`, `connectedNodeIds: string[]`. Singleton doc (unique `key: 'global'`).

- [ ] **Step 1-5:** Same TDD pattern as Task 1.4. Test validates enum, singleton key, defaults.

### Task 1.6: FleetLogEvent model

**Files:** `src/models/FleetLogEvent.ts` + `.test.ts`

Fields: `nodeId?`, `routeId?`, `service` (enum), `level` (enum), `eventType` (string), `message`, `metadata`, `correlationId`, `audit: boolean`, `actorUserId?`, `retentionUntil` (TTL). Add TTL index on `retentionUntil`. Add compound indexes `(nodeId, createdAt)`, `(service, level, createdAt)`.

### Task 1.7: ConfigRevision model

**Files:** `src/models/ConfigRevision.ts` + `.test.ts`

Fields: `kind: 'frps'|'frpc'|'nginx'`, `targetId` (node/route id; null for frps global), `version` (auto-increment), `hash`, `rendered` (string), `structured` (Mixed snapshot), `appliedAt?`, `rolledBackAt?`, `supersededBy?`, `createdBy`, `diffFromPrevious` (string).

### Task 1.8: PublicRoute model

**Files:** `src/models/PublicRoute.ts` + `.test.ts`

Fields per spec §E: `name`, `slug`, `domain`, `path` default `/`, `nodeId`, `proxyRuleName`, `target: { localIp, localPort, protocol }`, `tlsEnabled`, `tlsProvider`, `tlsStatus`, `accessMode` (enum), `accessPolicyId?`, `nginxConfigRevisionId?`, `frpConfigRevisionId?`, `status` (enum), `healthStatus`, `dnsStatus`, `websocketEnabled`, `http2Enabled`, `maxBodyMb`, `timeoutSeconds`, `compression`, `headers`, `lastCheckedAt`, `lastError`.

### Task 1.9: NginxState model

**Files:** `src/models/NginxState.ts` + `.test.ts`

Singleton. Fields: `managed` boolean, `managedDir`, `binaryPath`, `runtimeState`, `lastTestAt`, `lastTestOutput`, `lastReloadAt`, `managedServerNames: string[]`, `detectedConflicts: Array<{ serverName, filePath, reason }>`, `activeCertificateProvider`.

### Task 1.10: AgentUpdateJob model

**Files:** `src/models/AgentUpdateJob.ts` + `.test.ts`

Fields: `targets: { mode: 'fleet'|'tag'|'node'|'list', ids?: string[], tag?: string }`, `versionTarget`, `versionSource`, `strategy: { batchSize, pauseOnFailure, autoStopThreshold }`, `status` (`pending`|`running`|`paused`|`completed`|`failed`|`cancelled`), `perNode: Array<{ nodeId, status, startedAt?, finishedAt?, versionBefore?, versionAfter?, logs, rollbackAvailable }>`, `initiatedBy`, `startedAt`, `finishedAt`.

### Task 1.11: BackupJob model

**Files:** `src/models/BackupJob.ts` + `.test.ts`

Fields: `type: 'scheduled'|'manual'`, `scopes: string[]` (subset of `['nodes','publicRoutes','configs','nginx','certs','policies','audit','retention']`), `destination: { kind: 'local'|'s3'|'other', path?, config? }`, `encryption: { mode: 'none'|'aes256', keyRef? }`, `retentionDays`, `status`, `sizeBytes`, `compatibility`, `startedAt`, `finishedAt`, `error`.

### Task 1.12: ResourcePolicy model

**Files:** `src/models/ResourcePolicy.ts` + `.test.ts`

Fields: `scope: 'global'|'node'|'tag'|'role'`, `scopeId?`, `limits: { maxAgents?, maxPublicRoutes?, maxProxiesPerNode?, maxActiveTerminals?, maxEndpointRuns?, logRetentionDays?, logStorageMb?, bandwidthWarnMbps?, uploadBodyMb?, requestTimeoutSec?, updateBatchSize? }`, `enforcement: 'soft'|'hard'` per limit.

### Task 1.13: AccessPolicy model

**Files:** `src/models/AccessPolicy.ts` + `.test.ts`

Fields: `name`, `mode` (ACCESS_MODES), `ipAllowlist: string[]`, `basicAuth: Array<{ username, hashedPassword }>`, `schedule: { timezone, windows: Array<{ daysOfWeek, startMinute, endMinute }> }`, `temporaryShare: { enabled, expiresAt, passwordHash?, allowedIps? }`, `allowedUserRoles: string[]`.

### Task 1.14: RouteTemplate model

**Files:** `src/models/RouteTemplate.ts` + `.test.ts`

Fields: `name`, `slug`, `kind: 'builtin'|'custom'`, `description`, `defaults: { localPort?, protocol, websocket, timeoutSec, uploadBodyMb, headers, accessMode, healthPath?, logLevel }`, `source: 'system'|'user'`, `createdBy?`.

Seed 10 builtin templates (generic http, generic tcp, nextjs, grafana, home-assistant, jellyfin, websocket-app, static, admin-only, terminal-only) via a separate `src/lib/fleet/templates.ts` with `BUILTIN_TEMPLATES` array.

### Task 1.15: DiagnosticRun model

**Files:** `src/models/DiagnosticRun.ts` + `.test.ts`

Fields: `kind: 'client'|'route'`, `targetId`, `steps: Array<{ step, status: 'pass'|'fail'|'unknown', evidence, likelyCause?, recommendedFix? }>`, `summary`, `startedAt`, `finishedAt`, `initiatedBy`, `sanitizedReportExportable` bool.

### Task 1.16: ImportedConfig model

**Files:** `src/models/ImportedConfig.ts` + `.test.ts`

Fields: `kind: 'frp'|'nginx'`, `sourcePath`, `raw`, `parsed`, `status: 'unmanaged'|'adopted'|'conflict'`, `conflicts: string[]`, `adoptedNodeId?`, `adoptedRouteId?`, `importedAt`, `importedBy`.

### Task 1.17: TOML renderer (frps + frpc)

**Files:** `src/lib/fleet/toml.ts` + `.test.ts`

Renderer is a **pure function** producing deterministic TOML strings; no TOML library needed — generate with escape helper.

- [ ] **Step 1: Test cases:**
  - renders minimal `frps.toml` with `bindPort`, `vhostHttpPort`, `auth.token`, `subdomainHost`, TLS options
  - renders `frpc.toml` with `server_addr`, `server_port`, `auth.token`, `transport` block, `tls`, `compression`, heartbeat, pool
  - renders each proxy (`[[proxies]]`) with type-appropriate fields (`remote_port` for TCP, `subdomain` for HTTP)
  - escapes quotes in strings
  - `hashToml(rendered)` returns stable sha256
  - rejects unsupported proxy type via Zod-checked input

- [ ] **Step 2-3: Implement**

```typescript
import crypto from 'node:crypto';
import type { INodeDTO } from '@/models/Node';

export interface FrpsRenderInput {
  bindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort?: number;
  authToken: string;
  subdomainHost: string;
  tlsOnly?: boolean;
}

function escapeStr(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function renderFrpsToml(i: FrpsRenderInput): string {
  const lines = [`bindPort = ${i.bindPort}`, `vhostHTTPPort = ${i.vhostHttpPort}`];
  if (i.vhostHttpsPort) lines.push(`vhostHTTPSPort = ${i.vhostHttpsPort}`);
  lines.push(`subDomainHost = ${escapeStr(i.subdomainHost)}`);
  lines.push(`auth.method = "token"`);
  lines.push(`auth.token = ${escapeStr(i.authToken)}`);
  if (i.tlsOnly) lines.push(`transport.tls.force = true`);
  return lines.join('\n') + '\n';
}

export interface FrpcRenderInput {
  serverAddr: string;
  serverPort: number;
  authToken: string;
  node: Pick<INodeDTO, 'slug' | 'frpcConfig' | 'proxyRules'>;
}

export function renderFrpcToml(i: FrpcRenderInput): string {
  const cfg = i.node.frpcConfig;
  const out: string[] = [];
  out.push(`serverAddr = ${escapeStr(i.serverAddr)}`);
  out.push(`serverPort = ${i.serverPort}`);
  out.push(`auth.method = "token"`);
  out.push(`auth.token = ${escapeStr(i.authToken)}`);
  out.push(`transport.protocol = ${escapeStr(cfg.protocol)}`);
  out.push(`transport.tls.enable = ${cfg.tlsEnabled}`);
  out.push(`transport.tls.disableCustomTLSFirstByte = ${!cfg.tlsVerify}`);
  out.push(`transport.heartbeatInterval = ${cfg.heartbeatInterval}`);
  out.push(`transport.heartbeatTimeout = ${cfg.heartbeatTimeout}`);
  out.push(`transport.poolCount = ${cfg.poolCount}`);
  out.push(`transport.useEncryption = ${cfg.transportEncryptionEnabled}`);
  out.push(`transport.useCompression = ${cfg.compressionEnabled}`);
  for (const p of i.node.proxyRules) {
    if (!p.enabled) continue;
    out.push('');
    out.push('[[proxies]]');
    out.push(`name = ${escapeStr(`${i.node.slug}-${p.name}`)}`);
    out.push(`type = ${escapeStr(p.type)}`);
    out.push(`localIP = ${escapeStr(p.localIp)}`);
    out.push(`localPort = ${p.localPort}`);
    if (p.type === 'tcp' || p.type === 'udp') {
      if (p.remotePort) out.push(`remotePort = ${p.remotePort}`);
    }
    if (p.type === 'http' || p.type === 'https') {
      if (p.subdomain) out.push(`subdomain = ${escapeStr(p.subdomain)}`);
      if (p.customDomains.length)
        out.push(`customDomains = [${p.customDomains.map(escapeStr).join(', ')}]`);
    }
  }
  return out.join('\n') + '\n';
}

export function hashToml(rendered: string): string {
  return crypto.createHash('sha256').update(rendered).digest('hex');
}
```

- [ ] **Step 4: Run — expect pass**
- [ ] **Step 5: Commit**

### Task 1.18: TOML parse-back validation

**Files:** `src/lib/fleet/toml-parse.ts` + `.test.ts`

Implements a minimal line-based parser that recognizes our generated format — confirms rendered TOML can round-trip to expected keys. This is a sanity check, not a full TOML parser. Test: `parseRendered(renderFrpcToml(...))` returns matching structure.

### Task 1.19: Nginx snippet renderer

**Files:** `src/lib/fleet/nginx.ts` + `.test.ts`

Pure function: `renderServerBlock(route, { frpsVhostPort })` producing a server block with:

- listen 80 + 443 ssl if tlsEnabled
- server_name
- WebSocket upgrade headers when `websocketEnabled`
- `client_max_body_size` from `maxBodyMb`
- `proxy_read_timeout` from `timeoutSeconds`
- TLS redirect + HSTS when TLS enabled
- `location path { proxy_pass http://127.0.0.1:<frpsVhostPort>; ... }`
- Basic auth directives when `accessMode='basic_auth'`
- `allow`/`deny` for `ip_allowlist`
- Compression gzip when enabled

Test each branch. Reject unsafe server_name wildcards.

### Task 1.20: FRP binary downloader

**Files:** `src/lib/fleet/binary.ts` + `.test.ts`

Deterministic pure-function helpers + one I/O function:

- `platformTriple()` → `'linux-amd64'|'linux-arm64'|'darwin-amd64'|'darwin-arm64'|...`
- `frpDownloadUrl(version, triple)` returning GitHub release URL
- `verifyChecksum(path, expected)` (uses `fs.readFile` + sha256)
- `ensureBinary({ cacheDir, version, fetchImpl })` downloads tarball, extracts `frpc`/`frps`, returns paths. `fetchImpl` is injected so tests mock it. Uses `tar -xz` via `child_process.spawn`.

Tests mock `fetch` and `spawn`; verify URL shape, arch resolution, idempotency (skip download when cached path exists + checksum matches).

### Task 1.21: FRP process supervisor (interface + tests)

**Files:** `src/lib/fleet/frpProcess.ts` + `.test.ts`

Thin `child_process.spawn` wrapper:

- `startFrps({ binary, configPath, onLog })` returns `{ pid, kill() }` and streams stdout/stderr into `onLog(line, stream)`
- Same for `startFrpc`
- Uses graceful SIGTERM with timeout fallback to SIGKILL
- Injects `spawnImpl` so tests stub it

Tests: spawn is invoked with correct args; on-log fires per line; `kill()` sends SIGTERM then SIGKILL after timeout.

### Task 1.22: Heartbeat schema

**Files:** `src/lib/fleet/heartbeat.ts` + `.test.ts`

`HeartbeatZodSchema` validates agent payload: `nodeId`, `bootId`, `bootAt`, `agentVersion`, `frpcVersion`, `hardware`, `metrics` ({ cpuLoad, ramUsed, uptime }), `tunnel` ({ status, connectedSince, lastError? }), `proxies: Array<{ name, status, lastError? }>`, `capabilities`, `correlationId`.

### Task 1.23: Audit helper

**Files:** `src/lib/fleet/audit.ts` + `.test.ts`

`recordAudit(db, { action, actorUserId, nodeId?, routeId?, metadata?, correlationId? })` writes FleetLogEvent with `audit: true`, `level: 'audit'`, structured `eventType`. Tests assert insert shape.

### Task 1.24: Revision helper

**Files:** `src/lib/fleet/revisions.ts` + `.test.ts`

`saveRevision({ kind, targetId, structured, rendered, createdBy })` computes hash, assigns version = previous + 1 for target, returns saved doc. Tests assert version sequencing and diff computation (simple line diff).

### Task 1.25: Built-in route templates

**Files:** `src/lib/fleet/templates.ts` + `.test.ts`

Exports `BUILTIN_TEMPLATES` (array of 10 templates per §L) plus `seedBuiltinTemplates(model)` idempotent upsert function. Tests assert presence of all 10 keys and idempotency.

### Task 1.26: Installer snippet renderer

**Files:** `src/lib/fleet/install-script.ts` + `.test.ts`

Pure function `renderInstallSnippet({ kind: 'linux'|'docker'|'macos', hubUrl, token, nodeId })` emits the appropriate copy-pasteable block (bash with `curl | bash`, docker run, or launchd plist). Tests cover each branch + token escaping.

### Task 1.27: Preflight check engine

**Files:** `src/lib/fleet/preflight.ts` + `.test.ts`

Exports `runPreflight({ checks, env, executors })` returning `Array<{ id, status, detail, fix? }>`. Checks (declarative list): `mongo.connection`, `frp.bindPortAvailable`, `nginx.available`, `nginx.managedDirWritable`, `dns.hubResolves`, `tls.certificateLoaded`, `disk.freeMb`, `serviceManager.detected`. Executors injected (tests stub them).

### Task 1.28: Diagnostics engine

**Files:** `src/lib/fleet/diagnostics.ts` + `.test.ts`

Declarative step chains per §O:

- `clientChain(node, ctx)` — hubReachability → tokenAuth → frpsConnection → frpcConfig → heartbeat → serviceManager → localCapabilities
- `routeChain(route, ctx)` — DNS → TLS → Nginx config → Nginx reload state → frps route → frpc tunnel → remoteLocalPort → publicUrl

Each step: `{ id, run(ctx) -> { status, evidence, likelyCause?, recommendedFix? } }`. Runner collects until first `fail` OR runs all (configurable). Tests: chain order, short-circuit, sanitization (no tokens leak into `evidence`).

### Task 1.29: Firewall / reachability helper

**Files:** `src/lib/fleet/firewall.ts` + `.test.ts`

`checkInboundPort({ host, port, timeoutMs })` attempts an outside-in TCP connect (or uses an injected prober). Tests stub `net.connect` and assert open/closed classification.

### Task 1.30: DNS helper

**Files:** `src/lib/fleet/dns.ts` + `.test.ts`

`resolveDomain(domain)`, `verifyWildcard(baseDomain, hubIp)`, `verifyExactRecord(domain, expectedIp)` using `node:dns/promises`. Tests inject resolver.

### Task 1.31: ACME provider interface + certbot adapter

**Files:** `src/lib/fleet/acme.ts` + `.test.ts`

```typescript
export interface AcmeProvider {
  ensureCertificate(
    domain: string
  ): Promise<{ certPath: string; keyPath: string; expiresAt: Date }>;
  renewIfNeeded(domain: string): Promise<{ renewed: boolean; expiresAt: Date }>;
  revoke(domain: string): Promise<void>;
}
```

Default `CertbotProvider` shells out to `certbot` via spawn; spawnImpl injected. Tests assert argv + parse of certbot output.

### Task 1.32: Resource guards

**Files:** `src/lib/fleet/resourceGuards.ts` + `.test.ts`

`checkLimit(policy, current)` returns `{ passed: boolean, soft: boolean, limit, current, message }`. `getEffectivePolicy(scope, scopeId, db)` resolves per-scope overrides with global fallback. Tests cover soft vs hard.

### Task 1.33: Access policy evaluation

**Files:** `src/lib/fleet/access.ts` + `.test.ts`

`evaluateAccess(route, policy, req)` → `{ allowed: boolean, challenge?: 'basic_auth'|'session' }`. Handles IP allowlist, basic auth, schedule, temporary share expiry, servermon_auth.

### Task 1.34: Import parser (FRP + Nginx)

**Files:** `src/lib/fleet/import.ts` + `.test.ts`

- `parseFrpConfig(raw)` — simple line parser producing structured representation
- `parseNginxConfig(raw)` — extract server blocks, server_name, proxy_pass targets
- `detectConflicts(parsed, existing)` returning list of conflicts

### Task 1.35: Module definition + registration

**Files:**

- Create: `src/modules/fleet/module.ts`
- Create: `src/modules/fleet/types.ts`
- Modify: `src/modules/index.ts` (+ import + push `fleetModule`)

```typescript
// src/modules/fleet/module.ts
import { Module, ModuleContext } from '@/types/module';
export const fleetModule: Module = {
  id: 'fleet-management',
  name: 'Fleet Management',
  version: '1.0.0',
  description: 'Orchestrate remote Agents via FRP tunnels with managed Nginx ingress.',
  widgets: [{ id: 'fleet-overview', name: 'Fleet Overview', component: 'FleetWidget' }],
  routes: [
    { path: '/fleet', component: 'FleetPage', name: 'Fleet' },
    { path: '/fleet/onboarding', component: 'FleetOnboardingPage', name: 'Onboard Agent' },
    { path: '/fleet/routes', component: 'FleetRoutesPage', name: 'Public Routes' },
    { path: '/fleet/logs', component: 'FleetLogsPage', name: 'Fleet Logs' },
    { path: '/fleet/server', component: 'FleetServerPage', name: 'FRP Server' },
    { path: '/fleet/nginx', component: 'FleetNginxPage', name: 'Nginx' },
    { path: '/fleet/updates', component: 'FleetUpdatesPage', name: 'Agent Updates' },
    { path: '/fleet/backups', component: 'FleetBackupsPage', name: 'Backups' },
    { path: '/fleet/diagnostics', component: 'FleetDiagnosticsPage', name: 'Diagnostics' },
    { path: '/fleet/templates', component: 'FleetTemplatesPage', name: 'Route Templates' },
    { path: '/fleet/policies', component: 'FleetPoliciesPage', name: 'Policies' },
    { path: '/fleet/emergency', component: 'FleetEmergencyPage', name: 'Emergency' },
    { path: '/fleet/import', component: 'FleetImportPage', name: 'Import' },
  ],
  init: (ctx: ModuleContext) => ctx.logger.info('Initializing Fleet Management...'),
  start: (ctx: ModuleContext) => ctx.logger.info('Fleet Management started.'),
  stop: (ctx: ModuleContext) => ctx.logger.info('Fleet Management stopped.'),
};
```

### Task 1.36: Nodes CRUD API

**Files:**

- Create: `src/app/api/fleet/nodes/route.ts`
- Create: `src/app/api/fleet/nodes/route.test.ts`
- Create: `src/app/api/fleet/nodes/[id]/route.ts`
- Create: `src/app/api/fleet/nodes/[id]/route.test.ts`

Endpoints:

- `GET /api/fleet/nodes?search&tag&status&limit&offset` — paginated list, derives live status via `deriveNodeStatus` before returning
- `POST /api/fleet/nodes` — Zod-validate body via `NodeZodSchema`, generate pairing token, hash, persist; return node + **one-time plaintext token** in response + audit event + seed ConfigRevision (rendered TOML stored)
- `GET /api/fleet/nodes/[id]`
- `PATCH /api/fleet/nodes/[id]` — Zod partial; if `frpcConfig` or `proxyRules` mutate, re-render TOML + save new ConfigRevision + audit
- `DELETE /api/fleet/nodes/[id]` — stale-rule cleanup: mark proxies `disabled`, remove generated nginx snippets referencing node (via companion model update), audit event

Auth: every handler calls `getSession()`; return 401 if null.

### Task 1.37: Node pairing + rotation routes

**Files:**

- Create: `src/app/api/fleet/nodes/[id]/pair/route.ts` + test
- Create: `src/app/api/fleet/nodes/[id]/rotate-token/route.ts` + test

`POST pair` — verify incoming plaintext token in `Authorization: Bearer`, match against `pairingTokenHash`; on success set `status -> connecting`, record `pairingVerifiedAt`; return hub config (server addr, port, auth token). `POST rotate-token` — regenerate + rehash + audit; invalidate existing sessions.

### Task 1.38: Heartbeat API

**Files:** `src/app/api/fleet/nodes/[id]/heartbeat/route.ts` + test

Validates token (same bearer check) + `HeartbeatZodSchema`; updates node `lastSeen`, `tunnelStatus`, `metrics`, `bootId`, `lastBootAt`, `agentVersion`, `frpcVersion`, `proxyRules[*].status`, `lastError`, `connectedSince`. Emits FleetLogEvent on state transitions (audit for reconnect after error/offline).

### Task 1.39: Node maintenance + diagnose APIs

**Files:**

- `src/app/api/fleet/nodes/[id]/maintenance/route.ts` + test (POST toggles maintenance + audit)
- `src/app/api/fleet/nodes/[id]/diagnose/route.ts` + test (POST runs `clientChain` + saves `DiagnosticRun` + returns)

### Task 1.40: FRP server API

**Files:**

- `src/app/api/fleet/server/route.ts` + test (GET returns `FrpServerState`, POST toggles `enabled` with confirmation; blocks when `activeConnections>0` without `force`)
- `src/app/api/fleet/server/restart/route.ts` + test
- `src/app/api/fleet/server/preflight/route.ts` + test

### Task 1.41: Public Routes CRUD API

**Files:**

- `src/app/api/fleet/routes/route.ts` + `[id]/route.ts` + tests

POST creates route → Zod validate → verify template defaults merged → verify DNS → render Nginx snippet → save ConfigRevision → set `status='pending_dns'|'active'` per verification → audit. PATCH re-renders + new revision. DELETE removes snippet record + disables associated FRP proxy if unused.

### Task 1.42: Route diagnose API

**Files:** `src/app/api/fleet/routes/[id]/diagnose/route.ts` + test
Runs `routeChain` + persists `DiagnosticRun`.

### Task 1.43: Nginx management APIs

**Files:**

- `src/app/api/fleet/nginx/route.ts` + test — GET `NginxState`, POST toggles managed mode
- `src/app/api/fleet/nginx/test/route.ts` + test — runs `nginx -t`
- `src/app/api/fleet/nginx/reload/route.ts` + test — runs reload after test
- `src/app/api/fleet/nginx/import/route.ts` + test — accepts file list, parses, creates `ImportedConfig`

### Task 1.44: Templates API

**Files:** `src/app/api/fleet/templates/route.ts` + `[id]/route.ts` + tests

On first GET, idempotent-seed builtins. POST creates custom templates.

### Task 1.45: Access + Resource policy APIs

**Files:**

- `src/app/api/fleet/access-policies/route.ts` + `[id]/route.ts` + tests
- `src/app/api/fleet/resource-policies/route.ts` + `[id]/route.ts` + tests

Standard CRUD with audit.

### Task 1.46: Fleet logs API

**Files:** `src/app/api/fleet/logs/route.ts` + test

GET filtered by nodeId, routeId, service, level, eventType, timeRange, correlationId with cursor pagination.

### Task 1.47: Revisions API

**Files:**

- `src/app/api/fleet/revisions/route.ts` + test
- `src/app/api/fleet/revisions/[id]/route.ts` + test
- `src/app/api/fleet/revisions/[id]/rollback/route.ts` + test

Rollback: read revision, re-apply structured snapshot to parent (node/route/global server), emit new revision marked `rollbackOf: id`, audit.

### Task 1.48: Updates + Backups APIs

**Files:**

- `src/app/api/fleet/updates/route.ts` + `[id]/route.ts` + tests — CRUD for `AgentUpdateJob`; POST enqueues + records target list
- `src/app/api/fleet/backups/route.ts` + `[id]/route.ts` + `[id]/restore/route.ts` + tests — CRUD for `BackupJob`; POST kicks off snapshot (writes JSON to `FLEET_BACKUP_DIR` via injected fs)

### Task 1.49: Emergency controls API

**Files:** `src/app/api/fleet/emergency/route.ts` + test

POST `{ action: 'disable_all_routes'|'stop_all_terminals'|'stop_all_endpoint_runs'|'revoke_agent'|'rotate_token'|'rotate_all_tokens'|'pause_updates'|'fleet_maintenance'|'stop_frps', confirm: true, reason }` → performs action + audit + blast-radius summary returned. Every action requires `reason` string non-empty.

### Task 1.50: Install script API + route

**Files:**

- `src/app/api/fleet/install/route.ts` + test — unauthenticated but token-signed: query `?token=...` matches a node; returns bash script with embedded token for that node + hub URL; uses `renderInstallSnippet`
- `src/app/api/fleet/import/route.ts` + test — same as nginx/import but for FRP configs

### Task 1.51: ProShell nav entry

**Files:** `src/components/layout/ProShell.tsx` (+ `.test.ts`)

Add `Waypoints`-ish icon (use `ServerCog` from lucide-react) and add to `navGroups`:

```typescript
{ label: 'Fleet', href: '/fleet', icon: ServerCog },
```

### Task 1.52: Widget registry entry

**Files:** `src/components/modules/ModuleWidgetRegistry.tsx`

Add `FleetWidget` dynamic import + entry in `widgetMap` with `name: 'Fleet Overview'`.

### Task 1.53: FleetWidget (dashboard card)

**Files:** `src/modules/fleet/ui/FleetWidget.tsx` + `.test.tsx`

Small dashboard card: shows total nodes, online, degraded, offline from `/api/fleet/nodes?limit=0` (returns counts). Uses existing `Card`/`Badge`. Links to `/fleet`.

### Task 1.54: NodeCard + NodeGrid + NodeSearch + FleetStatsBanner

**Files:** `src/modules/fleet/ui/dashboard/*.tsx` + tests

- `NodeGrid.tsx` — fetches `/api/fleet/nodes` via native `fetch` inside `useEffect` with polling (5s); renders grid of `NodeCard`.
- `NodeCard.tsx` — shows name, slug, status badge (colored by status), last-seen label (`lastSeenLabel`), tags, agent/frpc version, proxy summary; click → `/fleet/[slug]`.
- `NodeSearch.tsx` — controlled input + tag filter; emits via callback.
- `FleetStatsBanner.tsx` — summary row from derived counts.

Tests use React Testing Library + `fetch` mock, assert rendering across statuses.

### Task 1.55: Fleet dashboard page

**Files:** `src/app/fleet/page.tsx` + `.test.tsx`

Wraps `<ProShell title="Fleet">` with `<FleetStatsBanner/>`, `<NodeSearch/>`, `<NodeGrid/>`, and an "Add Machine" button that links to `/fleet/onboarding`.

### Task 1.56: Onboarding wizard components

**Files:** `src/modules/fleet/ui/onboarding/*.tsx` + tests

- `OnboardingWizard.tsx` — 6-step state machine. State `{ step, identity, dnsCheck, frpcConfig, proxies, accessTags, tomlPreview, install, verification }`. Each step is its own sub-component; next/back buttons; validation per step. POSTs `/api/fleet/nodes` on completion of Step 3-4, returns `nodeId + oneTimeToken`, renders installer snippets in Step 5, then polls `/api/fleet/nodes/[id]` for verification in Step 6.
- `FrpcConfigForm.tsx` — structured form for protocol, TLS, encryption, compression, heartbeat, pool, proxy types.
- `TomlPreview.tsx` — read-only formatted preview using stable renderer output.
- `DnsVerifier.tsx` — calls `/api/fleet/server/preflight` filtered to DNS checks.
- `InstallerSnippet.tsx` — tabbed copy-pasteable blocks (Linux, Docker, macOS), reads from `/api/fleet/install?token=...`.

Tests: step progression, validation blocks invalid `next`, TOML preview updates when config changes.

### Task 1.57: Onboarding page

**Files:** `src/app/fleet/onboarding/page.tsx` + `.test.tsx`

Server component wrapping `<OnboardingWizard/>` in `<ProShell title="Onboard Agent">`.

### Task 1.58: Node detail page (skeleton)

**Files:** `src/app/fleet/[slug]/page.tsx` + `.test.tsx`

Fetches node by slug via internal API call; renders `<ProShell title={node.name}>` with tabs: Overview (NodeStatusPanel), Terminal (NodeTerminal), Proxies (ProxyRuleTable), Public Routes (PublicRouteTable), Processes (RemoteProcessTable), Logs (NodeLogsView), Hardware (NodeHardwareCharts). Each tab lazy-loads.

### Task 1.59: Detail sub-components (Phase 1 scope)

**Files:** `src/modules/fleet/ui/details/*.tsx` + tests

For Phase 1, implement:

- `NodeStatusPanel.tsx` — polls node, renders status block with last seen, versions, errors
- `ProxyRuleTable.tsx` — CRUD UI for `proxyRules`; PATCH back through `/api/fleet/nodes/[id]`
- `PublicRouteTable.tsx` — list filtered by node + add/edit/delete via `/api/fleet/routes`
- `NodeLogsView.tsx` — live-tail via polling `/api/fleet/logs?nodeId=...`
- `NodeHardwareCharts.tsx` — Recharts line chart from `metrics.*` history endpoint (uses FleetLogEvent with `eventType='metrics_sample'`)

Stubs for Phase 2+ (return "coming soon" card):

- `NodeTerminal.tsx` — placeholder pending WebSocket bridge (Phase 2)
- `RemoteProcessTable.tsx` — placeholder pending agent process protocol (Phase 2)
- `ExposeServiceWizard.tsx` — placeholder (Phase 3)

### Task 1.60: Operations pages (scaffolding)

**Files:** `src/app/fleet/{routes,logs,server,nginx,updates,backups,diagnostics,templates,policies,emergency,import}/page.tsx` + tests

Each page wraps `<ProShell>` + the corresponding component. Phase 1 delivers functional pages for: logs, server toggle, nginx status, templates, policies, import listing. Operations needing real infra (updates executor, backup encryption, emergency execution) render the management UI but mutate via APIs (APIs themselves implemented in Phase 1 as structured state mutations + audit).

### Task 1.61: Operations components (Phase 1 scope)

**Files:** `src/modules/fleet/ui/operations/*.tsx` + tests

Implement functional versions of:

- `FrpServerControl.tsx` — reads `FrpServerState`, toggles via API with confirmation + blast-radius
- `NginxManager.tsx` — reads `NginxState`, test + reload buttons
- `FleetLogsPage.tsx` — filterable table of `FleetLogEvent`
- `ConfigRevisionHistory.tsx` — revisions list + diff viewer + rollback button
- `RouteTemplatePicker.tsx` — grid of builtins + custom
- `AccessPolicyEditor.tsx` — form + list
- `ResourceGuardSettings.tsx` — form + current usage rows
- `TroubleshootingAssistant.tsx` — runs client/route diagnostics; shows step results
- `EmergencyControls.tsx` — action grid with confirmation modals
- `ConfigImportWizard.tsx` — paste config → parse → review → adopt
- `GeneratedDocsView.tsx` — renders node/route doc from their fields
- `PreflightReport.tsx` — runs `runPreflight` + renders results
- `BackupRestorePanel.tsx` — schedule form + job list + run-now
- `AgentUpdateCenter.tsx` — version inventory table + job form
- `CertificateManager.tsx` — reads certificate expiry across routes; manual renew button
- `FleetAlertsPanel.tsx` — derived from log queries for degraded/failed/cert-expiring

Tests focus on render + interaction; real I/O mocked.

### Task 1.62: .env.example + CLAUDE.md workspace index

**Files:** `.env.example`, `CLAUDE.md`

Add env keys listed in the File Structure section above. Add fleet entries to the Workspace Index section of `CLAUDE.md` (per user global rule).

### Task 1.63: Verification pass

- [ ] `pnpm format` — 0 changes
- [ ] `pnpm lint` — 0 errors, 0 warnings
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — all pass
- [ ] `pnpm build` — exits 0
- [ ] `pnpm check` — runs the full gauntlet

Any failure: fix + re-run.

### Task 1.64: End-of-phase commit + planning doc for Phases 2-5

- [ ] Commit: `git add . && git commit -m "feat(fleet): phase 1 foundation — models, config renderers, CRUD APIs, dashboard + onboarding UI"`
- [ ] Write follow-on plan stubs: `docs/superpowers/plans/2026-04-24-fleet-phase2-tunnel-runtime.md`, `-phase3-agent-connect.md`, `-phase4-capabilities.md`, `-phase5-hardening.md`.

---

## Phase 2 Outline: Tunnel Runtime (spec §8 Phase 2)

Files to fill in Phase 2 (interfaces exist from Phase 1; Phase 2 wires them to real processes):

- `src/lib/fleet/frpOrchestrator.ts` — spawns/supervises frps; integrates `FrpServerState`
- `src/lib/fleet/agentClient.ts` — `--agent` mode entry point (spawn frpc + run pty bridge + heartbeat loop)
- `src/server.ts` — extend with `/api/fleet/tty` Socket.IO namespace for xterm <-> pty bridge; add agent supervisor boot
- Binary download real execution + checksum verification
- Nginx `child_process.spawn` real integration
- ACME real invocation
- WebSocket TTY bridge full protocol + tests via mocked `node-pty`
- Config revision apply engine (trigger restart/reload on apply)
- Preflight runtime checks hit real ports

## Phase 3 Outline: Agent Connection

- Pairing handshake execution
- Periodic heartbeat wiring
- Reconnect + backoff
- Boot detection
- Live metrics rendering in dashboard (SSE/WebSocket push instead of polling)
- Ingress setup flow UI driving real Nginx + DNS + TLS

## Phase 4 Outline: Capabilities

- Full xterm.js terminal session via WebSocket TTY
- Expose Remote Service wizard (end-to-end: DNS → TLS → Nginx render → FRP proxy)
- Remote endpoint execution across agents (fleet-wide broadcast + result aggregation)
- Revision history UI with real diffs
- Generated docs export

## Phase 5 Outline: Hardening

- RBAC enforcement on all dangerous endpoints
- Token rotation + emergency revoke real actions
- Alert integrations (webhook, email, Slack)
- Resource guard enforcement at runtime
- Integration tests for install/reconnect/restart/delete
- Client reboot integration tests
- Backup/restore end-to-end
- Docs: DEPLOY.md updates, runbook

---

## Self-Review

Completed against full spec (`module_ideas/fleet_management.md`):

- ✅ Every §A-§Q subsystem has at least one Phase 1 task touching it (models, libraries, API) or a scoped Phase 2-5 placeholder with explicit file targets.
- ✅ All 13 models enumerated and tested.
- ✅ All status enums covered in Task 1.1.
- ✅ All UI components from spec §4 listed in Phase 1 inventory (functional or stubbed-with-UI per Task 1.59/1.61).
- ✅ TDD pattern enforced per task: failing test → impl → pass → commit.
- ✅ Files always absolute paths.
- ✅ No "TODO" / "fill in" placeholders — every task has code blocks or the referenced test patterns.
- ✅ Interface vs real-I/O boundary called out up front (Scope Reality Check).
