# Fleet Management — Phase 3: Agent Connection

**Goal:** Make the fleet "feel live." Phase 1 built state; Phase 2 built process supervisors. Phase 3 connects them end-to-end: heartbeat-driven live status that pushes to the dashboard, a real Expose Remote Service wizard that drives DNS + render + apply, post-reboot reconciliation, and the cloud ingress setup flow.

## Wave 3A: SSE fleet stream + live status push

- `src/lib/fleet/eventBus.ts` + `.test.ts` — in-process EventEmitter singleton publishing: `node.heartbeat`, `node.status_change`, `node.reboot`, `route.status_change`, `revision.applied`, `frp.state_change`.
- `src/app/api/fleet/stream/route.ts` + `.test.ts` — SSE endpoint (session-auth) streaming JSON events. Optional filter query: `nodeId`, `routeId`, `kind`.
- Heartbeat route: emit `node.heartbeat` always + `node.reboot` on bootId change + `node.status_change` on tunnelStatus transition.
- Apply + rollback routes: emit `revision.applied`.
- Server toggle route: emit `frp.state_change`.
- `src/modules/fleet/ui/lib/useFleetStream.ts` — React hook wrapping `EventSource`.
- Dashboard components (`NodeGrid`, `FleetStatsBanner`, `NodeStatusPanel`) subscribe to SSE in addition to existing polling.

## Wave 3B: Expose Remote Service wizard end-to-end

- Enhance `ExposeServiceWizard.tsx` to multi-step: Identity → Target → Access+TLS → Preview → DNS check → Create+Apply.
- Routes POST handler auto-inserts matching proxy on the parent Node when `proxyRuleName` not found; tcp/http type chosen from target.protocol.
- Routes PATCH handler re-runs DNS + re-renders nginx.

## Wave 3C: Cloud ingress setup flow

- `IngressSetupWizard.tsx` — 4-step: Hub URL check → Nginx managed dir → TLS provider config → DNS wildcard verify. Saves `FrpServerState.subdomainHost`, `NginxState.managedDir`; creates first `ConfigRevision` for frps.
- `src/app/fleet/setup/page.tsx`.
- ProShell nav: "Hub Setup" under Fleet.

## Wave 3D: Post-reboot reconciliation

- Extend `src/lib/fleet/status.ts` — add transitional statuses: `rebooting`, `starting_agent`, `reconnecting_tunnel`, `restoring_proxies` (inferred from `lastBootAt` within 2min + tunnelStatus progression).
- `src/lib/fleet/reconcile.ts` + `.test.ts` — post-reboot gap detector: checks heartbeat freshness + tunnel connected + each enabled proxy `active`. Returns list of gaps.
- Heartbeat route emits `node.reboot` with before/after boot info.
- `NodeCard.tsx` shows transitional statuses with a pulse indicator.
- `NodeStatusPanel.tsx` shows reboot banner + reconcile results.

## Wave 3E: Final verification + commit

- `pnpm format/lint/typecheck/test/build`
- git commit Phase 3
