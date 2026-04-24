# Fleet Management — Phase 4: Capabilities

**Goal:** Turn the wired fleet into a usable control plane. Real xterm.js terminal sessions over the TTY bridge, fleet-wide endpoint execution with aggregated results, live config-revision diff viewer, and exportable per-node / per-route documentation.

## Wave 4A: xterm.js terminal client

- Add `@xterm/xterm` + `@xterm/addon-fit` (already in deps) + `socket.io-client` (already) usage.
- Replace `NodeTerminal.tsx` Phase-1 stub with a real client that:
  - Mounts an xterm Terminal
  - Connects to `/api/fleet/tty` Socket.IO namespace
  - Emits `tty:open` with `{nodeId, sessionId}`; streams keystrokes → `tty:data`; listens for `tty:data`, `tty:exit`, `tty:error`, `tty:ready`
  - Resizes via `tty:resize` on window resize
  - Cleans up on unmount
- Add `useTtySession` hook wrapping the socket lifecycle.
- Tests: stub `io` factory; assert correct messages sent/received.

## Wave 4B: Fleet-wide endpoint execution

- Extend `CustomEndpoint` Zod schema with `target: { mode: 'local'|'single'|'fleet'|'tag'|'list', nodeIds?: string[], tag?: string }` default `{mode:'local'}`.
- New API `src/app/api/fleet/endpoint-exec/route.ts` + `.test.ts` — POST `{endpointId, payload}`:
  - Loads endpoint + resolves target nodeIds (from mode)
  - For `local`: runs existing executor path (unchanged)
  - For multi-node: for each node, POSTs `/api/fleet/nodes/<id>/execute-endpoint` (Phase 1-2 did not wire this — stub it as an in-memory queue that agents poll via heartbeat response, OR for Phase 4 use direct orchestrator call). For simplicity: queue a `FleetLogEvent` with `eventType:'endpoint.dispatched'` per target; agents will pick it up in future wave. Return `{ dispatched: [...nodeIds], results: [] }`.
- `FleetEndpointRunner.tsx` — UI to trigger a fleet-wide run + live aggregated results table.

## Wave 4C: Live revision diff viewer polish

- `ConfigRevisionHistory.tsx` already lists revisions + shows `diffFromPrevious`. Add:
  - Side-by-side panes for `rendered` prev vs current
  - Revision metadata panel (createdBy, createdAt, kind, appliedAt, rolledBackAt)
  - "Apply" button on non-applied revisions (POST `/api/fleet/revisions/[id]/apply`)
  - "Rollback to this" button (POST `/api/fleet/revisions/[id]/rollback`)
- Tests for the new buttons.

## Wave 4D: Generated docs export

- `GeneratedDocsView.tsx` — add "Download as Markdown" button that assembles a structured markdown doc (Purpose, Target, Access, Revisions, Health) and triggers browser download.
- `src/lib/fleet/docsMarkdown.ts` + `.test.ts` — pure function `renderNodeDoc(node, routes, revisions)` + `renderRouteDoc(route, revisions)`.

## Wave 4E: verification + commit
