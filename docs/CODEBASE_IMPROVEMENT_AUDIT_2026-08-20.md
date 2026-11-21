# ServerMon Full Codebase Improvement Audit

**Audit date:** 2026-08-20
**Audited revision:** `84557ce` (`fix: stabilize app update logging`)
**UI/UX remediation revision:** `2924cf0` (`chore: restore repository quality gates`) plus the documentation-only closeout commit
**Scope:** application code, API routes, custom server, workers, models, frontend, UX/accessibility, tests, dependencies, CI/CD, installer, release process, observability, and documentation

> Audit note: the security, reliability, dependency, and architectural findings remain a point-in-time review of `84557ce`. The remediation notes and verification tables record the approved accessible-operations/UI work implemented afterward. No unresolved security finding should be read as fixed unless its section explicitly says so.

## Executive summary

ServerMon has a broad, useful feature set and an unusually large automated test suite. Its strongest foundations are the module organization, substantial route/component coverage, typed models, release artifacts, operation/event records, and recent improvements to app deployment logs. However, the current revision should not be treated as safe for internet exposure or a production release until the P0 items below are resolved.

The most important finding is not cosmetic or performance-related: the former deny-by-default request proxy was deleted, while many pages and several sensitive API routes still assume that a global server-side authentication boundary exists. A client-side `SessionManager` now handles page redirects and patches `window.fetch`, but it is not a security boundary. This exposes routes that were written without local authorization checks.

The highest-risk instance is the self-service installer. Its install API is unauthenticated, accepts user-controlled template configuration, interpolates that configuration into shell commands, and executes those commands through `bash -c`. On a reachable ServerMon deployment, this creates a credible unauthenticated remote command-execution path. The self-service cancel and rollback endpoints are also unauthenticated, and cancellation currently changes job state without reliably stopping the executing pipeline.

The second major security theme is authorization. ServerMon defines `admin` and `user` roles, but several host-level capabilities only require an authenticated session. A normal user can open a PTY, submit an initial command, operate reboot or script-execution paths, and potentially attach to terminal sessions without a durable ownership check. This needs a centralized capability model rather than one-off role checks.

The original quality signal was mixed. The UI/UX remediation also repaired the local static/build baseline:

- `633` Vitest files and `5,087` tests pass after the remediation.
- Coverage is `72.61%` statements, `74.28%` lines, `70.46%` functions, and `63.00%` branches.
- The production build, release-contract check, type check, formatting check, and lint all pass.
- Type errors improved from `45` to `0`; format drift from `106` reported files to `0`; lint warnings from `7` to `0`.
- The production dependency audit reports `45` vulnerabilities: `23 high`, `17 moderate`, and `5 low`.
- There is only one Playwright spec, and browser tests are not part of the GitHub release gate.

### Release recommendation

**Do not publish or expose this revision as a production internet-facing control plane until P0 security findings are fixed and verified.** At minimum, disable the self-service execution endpoints, restore server-enforced default authentication, require administrator capabilities for host control, upgrade vulnerable runtime dependencies, and make type checking/formatting/security checks genuinely blocking.

## 2026-08-20 UI/UX remediation completed

The approved highest-value UI/UX work is complete:

- Added shared, dependency-free `Dialog`, `AlertDialog`, and `Drawer` primitives with portal rendering, accessible labeling, initial focus, Tab containment, Escape policy, trigger-focus restoration, background isolation, body-scroll restoration, nesting support, mobile safe areas, and 44-pixel close targets.
- Fixed the destructive-confirmation Enter-key bypass. Keyboard and button activation now use the same readiness predicate; unmatched verification text, loading state, IME composition, multiline inputs, selects, and editable content cannot bypass it.
- Added a shared operation-log status/control/viewer/dialog system with independent Follow and Autoscroll, Wrap, Copy, Download, full-screen viewing, explicit errors and empty states, and live-only controls.
- Rolled the operation-log pattern through Apps, system Updates, Cron runs, AI Runner details, self-service installation, Fleet operations, endpoint execution, and service logs while preserving domain-specific metadata and actions.
- Reconciled Apps queue and worker operation identities so the UI follows the record containing real deployment output, disables conflicting Deploy/Update actions while active, and does not get stranded on a vanished queue record.
- Restored browser pinch zoom, added a root user-motion preference boundary and reduced-motion CSS, and replaced the remaining decorative infinite animation with a stable reduced-motion state.
- Added a shared, visibility- and connectivity-aware polling registry with request deduplication, no overlap, abort-on-final-unsubscribe, stale refresh, capped backoff/jitter, and manual-refresh deduplication. Compatible resource pairs were migrated; specialized SSE, Socket.IO, optimistic mutation, and domain state-machine flows intentionally remain specialized.
- Consolidated CPU, memory, and health consumers onto one browser metrics stream.
- Repaired the repository-wide formatting/type/lint baseline uncovered by the audit without weakening compiler or lint rules.

This work closes the requested UI/UX scope. It does **not** close the P0 authentication, authorization, command-execution, dependency, or deployment-hardening findings below.

## Repository snapshot

| Area                            | Observed state                                          |
| ------------------------------- | ------------------------------------------------------- |
| TypeScript/TSX application size | Approximately 228,000 lines                             |
| Files under `src`               | Approximately 1,417                                     |
| API route files                 | Approximately 197                                       |
| Mongoose models                 | 52                                                      |
| Test files                      | 633 Vitest files plus 1 Playwright spec                 |
| Client-side React modules       | Approximately 255 files with `use client`               |
| Largest client component        | `AIRunnerPage.tsx`, 5,348 lines                         |
| Dynamic imports                 | Only 9 sites despite several heavy UI dependencies      |
| Route loading/error boundaries  | No `loading.tsx`, `error.tsx`, or `not-found.tsx` found |
| Motion usage                    | Root user preference support plus stable reduced motion |
| Production dependency audit     | 45 vulnerabilities: 23 high, 17 moderate, 5 low         |
| Unit/integration tests          | 5,087 passing                                           |
| Coverage                        | 72.61% statements; 63.00% branches                      |
| Type check                      | Passes; 0 errors (baseline was 45)                      |
| Format check                    | Passes; 0 files with drift (baseline was 106)           |
| Lint                            | Passes; 0 warnings (baseline was 7)                     |
| Build                           | Passes                                                  |

The counts are point-in-time measurements intended to show scale and risk concentration, not permanent architectural limits.

## Priority model

| Priority | Meaning                                                                       | Expected response                                              |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| P0       | Credible compromise, privilege escalation, or unsafe release condition        | Disable or contain immediately; fix before production exposure |
| P1       | High reliability/security risk or a major user-impacting defect               | Address in the next sprint, with regression coverage           |
| P2       | Material performance, maintainability, accessibility, or operational weakness | Schedule across the next 1–3 sprints                           |
| P3       | Product polish, consistency, or longer-term architecture work                 | Place in the planned improvement backlog                       |

## Immediate action plan

### First 24–72 hours

1. Disable `/api/modules/self-service/install*` at the reverse proxy or application level until authentication, validation, and safe process execution are implemented.
2. Restore a deny-by-default server-side authentication boundary for pages and APIs, then add route-local authorization to every privileged handler.
3. Restrict terminal, reboot, custom endpoint execution, update, deployment, firewall, Docker, service-control, and similar host operations to explicit administrator capabilities.
4. Upgrade the vulnerable runtime packages, beginning with Next.js, `systeminformation`, `ws`/Socket.IO dependencies, and Mongoose; rerun the production audit.
5. ~~Fix the confirmation modal Enter-key bypass before relying on typed destructive confirmations.~~ **Completed in the UI/UX remediation.**
6. Correct `/api/health` so a disconnected required database returns `503`.

### Next sprint

1. Introduce a centralized authorization/capability layer and ownership checks for socket events and terminal sessions.
2. Isolate all user-defined scripts and expressions from the web process; implement SSRF controls.
3. Harden initial setup, login, session cookies, token revocation, rate limiting, CSRF/origin handling, and security headers.
4. Make formatting, lint warnings, type checking, tests, dependency audit policy, and minimal browser smoke tests required checks for releases.
5. Add durable job state and real process cancellation for self-service provisioning.

### Following 30–90 days

1. Split large client pages by feature state and workflow, introduce a shared request/query layer, and lazy-load heavyweight tools.
2. Standardize accessible dialogs, drawers, streaming logs, tables, status badges, error states, and route boundaries.
3. Move schedulers and long-running work behind explicit lifecycle management and leader election.
4. Add retention policies, pagination, batched queries, graceful shutdown, structured observability, and release rollback automation.
5. Update the README, security model, runbooks, and architecture diagrams to match the implemented system.

---

## Detailed findings

## 1. Security and authorization

### SEC-01 — Restore deny-by-default server authentication

**Priority:** P0
**Risk:** Unauthenticated access to pages and API handlers that assume a global authentication layer

**Evidence**

- No current `src/proxy.ts` or middleware file protects requests.
- The previously present proxy can be inspected with `git show d6d8f25^:src/proxy.ts`; commit `d6d8f25` removed it as an orphaned file.
- `src/components/auth/SessionManager.tsx:35-150` redirects in the browser and monkey-patches `window.fetch`. This runs after page delivery, cannot protect server handlers, and does not cover EventSource, Socket.IO, direct HTTP clients, or server-side fetches.
- Pages such as `src/app/dashboard/page.tsx:342-350`, `src/app/terminal/page.tsx:1-14`, and `src/app/apps/page.tsx:1-12` do not enforce authentication on the server.
- Sensitive routes with no evident route-local authentication include:
  - `src/app/api/modules/endpoints/[id]/test/route.ts:34-91`
  - `src/app/api/modules/network/connections/route.ts:9-16`
  - `src/app/api/modules/ports/route.ts:9-16`
  - the self-service routes described in SEC-02
- `README.md:341-358` still describes “middleware-first” authentication and rate limiting, which does not match this revision.

**Why it matters**

Client redirects improve navigation but do not prevent an attacker from calling an API directly. The mixed model is particularly dangerous because route authors may reasonably assume that a global boundary has already authenticated the request.

**Recommendation**

1. Reinstate server-side, deny-by-default protection using the mechanism supported by the deployed Next.js version.
2. Maintain a small, explicit public-route registry for login, bootstrap/setup, selected health endpoints, branding assets, and deliberately public tokenized endpoints.
3. Keep route-local authorization on every privileged handler. A proxy is defense-in-depth, not a substitute for authorization in the route.
4. Upgrade Next.js before relying on proxy behavior because the installed version is affected by high-severity advisories, including proxy-bypass classes reported by the package audit.
5. Add a test that enumerates every route and fails when a new route has neither a public declaration nor an authorization policy.
6. Replace the global `window.fetch` patch with a typed API client that handles `401`/`403` consistently for browser calls.

**Acceptance criteria**

- Anonymous requests to every non-public page and API receive a server-side redirect or `401` before handler logic runs.
- Every privileged route independently verifies the required capability.
- EventSource, WebSocket, Socket.IO, browser navigation, and direct HTTP cases have tests.
- The public allowlist is short, reviewed, and covered by a route-classification test.

### SEC-02 — Unauthenticated self-service installer can execute injected shell commands

**Priority:** P0 / Critical
**Risk:** Unauthenticated remote command execution on the ServerMon host

**Evidence**

- `src/app/api/modules/self-service/install/route.ts:10-35` has no authentication or role check and accepts a user-controlled `config` object.
- `src/modules/self-service/engine/job-manager.ts:26-63` starts the provisioning pipeline asynchronously.
- `src/modules/self-service/engine/executor.ts:27-38` performs raw placeholder substitution using configuration values.
- `src/modules/self-service/engine/shell-executor.ts:38-44` executes rendered strings with `spawn('bash', ['-c', cmd])`.
- `src/modules/self-service/engine/provisioner.ts:277-337` renders configuration into package commands, URLs, domains, Nginx setup, and certificate commands.
- `src/modules/self-service/engine/steps/ssl-cert.ts:53-57`, `86-90`, and `113-136` interpolate domain values into shell command strings.
- Install status, cancel, rollback, and history paths are also unauthenticated, including:
  - `src/app/api/modules/self-service/install/[jobId]/route.ts:9-45`
  - `src/app/api/modules/self-service/install/[jobId]/rollback/route.ts:9-25`
- `cancelJob` changes state in `job-manager.ts:80-93`, but the provisioner loop at `provisioner.ts:115-168` does not reliably observe cancellation or terminate a running process.
- Job state is a module-level `Map` (`job-manager.ts:9-11`), so it is lost on restart and is inconsistent across multiple processes.
- Coverage shows the self-service UI at only 14.89% statement coverage and critical provisioning steps such as `ssl-cert.ts`, `preflight.ts`, and `systemd-unit.ts` at 0%.

**Why it matters**

This chain accepts attacker-controlled strings at an unauthenticated HTTP boundary and evaluates them through a shell on a management server. Authentication alone would reduce exposure but would not make the interpolation safe; a compromised or low-privilege account could still exploit it.

**Recommendation**

1. Immediately disable these endpoints until the complete chain is remediated.
2. Require an explicit administrator capability on install, cancel, rollback, and history operations.
3. Define a Zod schema per template. Reject unknown fields, enforce lengths and allowed character sets, parse URLs, and validate domain/IP/path values semantically.
4. Eliminate shell-string construction. Invoke fixed executables with argument arrays, use safe file APIs for configuration, and maintain a strict allowlist of commands and flags.
5. Never accept a raw command, package-manager fragment, URL fragment, environment assignment, file path, or service name from a template value.
6. Run provisioning in a separately supervised worker with a constrained service account and narrowly scoped privilege elevation.
7. Persist jobs, steps, process IDs, ownership, timestamps, and idempotency keys in the database.
8. Implement cancellation with an abort signal and process-group termination; check cancellation before and after every step.
9. Add malicious-input tests for shell metacharacters, substitution, newlines, Unicode edge cases, traversal, URL redirects, and oversized fields.

**Acceptance criteria**

- No untrusted value is evaluated by a shell.
- Anonymous and non-administrator requests cannot observe or control jobs.
- Cancellation stops the real process tree and leaves a deterministic terminal state.
- Restarting the web or worker process does not lose or duplicate active jobs.
- Security regression tests demonstrate that representative injection payloads are rejected or passed as inert arguments.

### SEC-03 — Role checks and terminal ownership are inconsistent

**Priority:** P0
**Risk:** Authenticated low-privilege users can perform host-level operations or access another user’s terminal

**Evidence**

- The user model defines `admin` and `user` roles in `src/models/User.ts:5-9` and `36-53`.
- Socket.IO authenticates a session, but `terminal:start` in `src/server.ts:303-345` does not enforce an administrator role and trusts client-provided `sessionId`, `username`, and `initialCommand` fields.
- PTYs are spawned with the server process environment at `src/server.ts:393-399`.
- Reattach logic at `src/server.ts:328-344` does not verify that the authenticated user owns the session.
- Data and resize events at `src/server.ts:476-490` operate on a current session ID without a durable owner authorization check.
- `createdBy` is client-provided rather than derived from the immutable authenticated user identity (`src/server.ts:250-257`, `401-423`).
- `src/models/TerminalSession.ts:3-20` has no immutable owner user ID.
- `src/app/api/system/reboot/route.ts:12-29` checks for a session but not an administrator capability.
- Custom endpoint create/update handlers allow any authenticated session to define executable Bash, Node, or Python behavior:
  - `src/app/api/modules/endpoints/create/route.ts:12-51`
  - `src/app/api/modules/endpoints/[id]/route.ts:37-120`
- `src/lib/endpoints/script-executor.ts:55-95` spawns that code, and the unauthenticated test route from SEC-01 can invoke an existing endpoint.

**Recommendation**

1. Define capabilities such as `system.view`, `system.operate`, `terminal.open`, `terminal.attach-own`, `terminal.attach-any`, `script.manage`, `script.execute`, `users.manage`, and `deployment.manage`.
2. Map roles to capabilities in one policy module and use it from both HTTP and Socket.IO handlers.
3. Store terminal ownership using the authenticated database user ID, never a client-supplied username.
4. Require ownership or `terminal.attach-any` for every attach/read/write/resize/close event.
5. Generate terminal session IDs on the server; validate all event payloads with size/range-limited schemas.
6. Do not inherit the entire server environment into a user shell. Supply a minimal allowlisted environment and remove application secrets.
7. Return `401` for anonymous requests and `403` for authenticated callers who lack a capability.
8. Add horizontal privilege-escalation tests using two users and two sockets.

**Acceptance criteria**

- A standard user cannot reboot, deploy, edit/execute scripts, operate services, or open a privileged terminal unless explicitly granted.
- A user cannot attach to, read, resize, write, or close another user’s terminal.
- Socket handlers derive identity exclusively from the verified socket session.
- The same capability policy is used by UI visibility, APIs, sockets, and audit logging.

### SEC-04 — Authentication, setup, and session lifecycle need hardening

**Priority:** P1
**Risk:** Account takeover, unrecoverable first-run compromise, weak session controls, and brute-force exposure

**Evidence**

- `src/lib/session.ts:10-18` and `27-42` set session cookies without explicit `secure` and `sameSite` options.
- `src/lib/session-core.ts:6-16` slices the configured secret to 32 characters, silently discarding later entropy instead of deriving a fixed-size key.
- Tokens have no server-side session record or revocation identifier; deleting or disabling a user does not revoke an issued token until expiry.
- `src/app/api/auth/login/route.ts:20-62` contains no rate limit, progressive delay, or lockout control.
- `src/app/api/setup/complete/route.ts:7-12` permits a one-character password.
- Initial setup uses a count-then-create sequence at `setup/complete/route.ts:18-51`, allowing a race between concurrent first-run requests.
- The first-run setup route is intentionally unauthenticated but is not bound to a local bootstrap token. A newly exposed instance can be claimed by the first remote caller.
- `next.config.ts:1-13` does not define a Content Security Policy, HSTS, Permissions Policy, frame restrictions, or other application-level security headers.
- There is no consistent CSRF/origin policy for state-changing cookie-authenticated requests.

**Recommendation**

1. Set explicit cookie properties: `httpOnly`, `secure` in production, `sameSite: 'lax'` or stricter as flows allow, and `path: '/'`.
2. Require a cryptographically random secret of a documented minimum size and derive the signing key using HKDF or a cryptographic hash; fail startup on weak/default secrets.
3. Add `iss`, `aud`, `sub`, `iat`, `exp`, and a unique session ID; persist active sessions or a user session-version so administrators can revoke them.
4. Revalidate that the user still exists, is enabled, and retains the required role for high-impact operations.
5. Add IP/account-aware login throttling, exponential delay, audit events, and a safe recovery path.
6. Require a strong initial password using the same policy as later account creation.
7. Protect first-run setup with a one-time bootstrap token emitted locally during installation, or bind setup to localhost until claimed. Make admin creation atomic with a unique singleton/transaction guard.
8. Apply origin/CSRF protections to state-changing cookie-authenticated requests.
9. Add a tested CSP and other security headers in Next.js and Nginx, avoiding obsolete `X-XSS-Protection` as a primary control.

### SEC-05 — User-defined code runs in the primary web process or with broad host access

**Priority:** P1
**Risk:** Event-loop denial of service, host compromise, secret exposure, and orphaned processes

**Evidence**

- `src/lib/endpoints/logic-executor.ts:54-64` uses `new Function`. An infinite loop blocks the Node.js event loop because no process or worker boundary can enforce the timeout.
- `src/lib/endpoints/webhook-executor.ts:62-66` also uses `new Function` for transformations.
- `src/lib/endpoints/script-executor.ts:55-95` launches interpreter processes on the host. Timeout handling does not provide strong CPU, memory, filesystem, network, or descendant-process isolation.
- Execution logging may retain request bodies, response bodies, stdout, and stderr, creating a path for secrets or personal data to be stored.

**Recommendation**

- Run custom logic and scripts in a dedicated worker process or locked-down container with hard CPU, memory, duration, output, filesystem, and network limits.
- Kill the full process group on timeout/cancellation and reap descendants.
- Use an allowlisted expression language for simple conditions rather than `new Function`.
- Restrict interpreters, imports, environment variables, working directories, and accessible mounts.
- Enforce per-endpoint concurrency, queue depth, rate, payload, output, and execution-time quotas.
- Redact secrets and allow endpoint owners to disable or minimize body logging.
- Audit every code change and invocation with immutable actor identity and operation ID.

### SEC-06 — Webhooks can perform server-side request forgery

**Priority:** P1
**Risk:** Access to internal services, loopback administration endpoints, or cloud metadata

**Evidence**

- `src/lib/endpoints/webhook-executor.ts:26-87` fetches configured URLs without a private-network/link-local/loopback policy and may follow redirects.
- `src/lib/fleet/alerts.ts:157-238` dispatches alert webhooks with similar trust in stored destinations.

**Recommendation**

1. Parse and normalize URLs; allow only expected schemes.
2. Resolve DNS and block loopback, RFC1918, link-local, multicast, reserved, Unix socket, and cloud metadata destinations unless an administrator explicitly allowlists them.
3. Repeat validation after every redirect and protect against DNS rebinding.
4. Consider an outbound proxy with destination allowlists and network-layer enforcement.
5. Apply strict timeouts, response-size caps, limited redirects, concurrency controls, and audit logging.

### SEC-07 — Production dependencies contain known high-severity vulnerabilities

**Priority:** P0 for exposed runtime packages; P1 for the remaining remediation
**Risk:** Exploitable framework, WebSocket, system-information, database, and transitive package weaknesses

**Evidence**

`pnpm audit --prod` on 2026-08-20 reported:

| Severity | Count |
| -------- | ----: |
| Critical |     0 |
| High     |    23 |
| Moderate |    17 |
| Low      |     5 |
| Total    |    45 |

Notable runtime findings include:

- Next.js `16.1.6`, with multiple high-severity advisories; the available version was `16.3.1`.
- `systeminformation` `5.31.4`, affected by command-injection advisories; a newer `5.33.1` was available.
- `ws` `8.18.3`, affected by memory-exhaustion/disclosure advisories; `8.21.3` was available.
- Socket.IO/Engine.IO parser and connection-exhaustion advisories.
- Mongoose `9.2.4`, with a prototype-pollution advisory; newer versions were available.
- PostCSS, Sharp, NanoID, and other transitive findings.

**Recommendation**

1. Upgrade patch/minor releases in a dedicated security change, starting with network-exposed and command-executing packages.
2. Re-run tests, type checking, build, Playwright smoke flows, installer tests, and `pnpm audit --prod` after each dependency group.
3. Define an audit policy that blocks new high/critical runtime vulnerabilities while allowing time-bound, documented exceptions.
4. Add Renovate or Dependabot with grouped, small updates and required checks.
5. Produce an SBOM and attach it to releases.

Do not blindly use a force update across major versions; some available latest versions are major upgrades and require focused compatibility work.

---

## 2. Reliability, background work, and operations

### REL-01 — Health readiness can report healthy while MongoDB is disconnected

**Priority:** P1
**Risk:** Load balancers keep routing traffic to an instance that cannot perform required database work

**Evidence**

`src/app/api/health/route.ts:13-33` sets `dbStatus` to `disconnected` when Mongoose is not connected, but computes health with:

```ts
const healthy = dbStatus !== 'error' && latest != null && !metricsError;
```

`disconnected !== 'error'`, so the endpoint can return HTTP 200 with `database: 'disconnected'` when a metrics sample exists.

**Recommendation**

- Split liveness and readiness explicitly.
- Keep `/api/health/ping` as a cheap process liveness check.
- Make readiness require `mongoose.connection.readyState === 1` and any other mandatory worker/service dependencies.
- Include a short timeout rather than blocking indefinitely.
- Add tests for connected, disconnected, connecting, failed, stale-metrics, and worker-unavailable states.
- Use readiness for traffic routing and liveness only for process restart decisions.

### REL-02 — Graceful shutdown and process lifecycle are incomplete

**Priority:** P1
**Risk:** Lost operations, corrupted session state, orphaned terminals, duplicate schedulers, and abrupt client disconnects

**Evidence**

- `src/server.ts:587-613` exits after limited cleanup without fully closing the HTTP server, Socket.IO, active SSE streams, PTYs, background intervals, database connections, and all schedulers.
- Startup awaits cleanup/reconciliation work before listening (`src/server.ts:163-198`), which can delay availability.
- `app.prepare().then(...)` lacks a robust top-level failure path.
- Several module-level timers and asynchronous intervals can overlap when work takes longer than the interval.

**Recommendation**

1. Introduce a lifecycle registry with `start()` and idempotent `stop()` for every server, scheduler, watcher, worker, PTY pool, and database resource.
2. On SIGTERM: stop accepting traffic, mark readiness false, stop scheduling, drain active operations with a deadline, close sockets/SSE, terminate PTYs, close the database, then exit.
3. Track in-flight operations and expose drain progress.
4. Guard async intervals against overlap and add jitter/backoff.
5. Add an integration test that starts the server, opens an SSE/socket session, sends SIGTERM, and verifies a bounded clean exit.

### REL-03 — Background work mixes web-process, worker-process, and in-memory state

**Priority:** P1
**Risk:** Duplicate jobs in horizontal deployments and lost state on restart

**Evidence**

- Apps have a separate worker, while other schedulers/supervisors start from the custom web server.
- Self-service jobs and metrics history are in memory.
- Alert throttling and other coordination state are partly process-local.
- A second web instance can start the same recurring work unless every scheduler has an independent durable lease.

**Recommendation**

- Document whether ServerMon is intentionally single-instance. Enforce that invariant if so.
- For scale/redundancy, move all durable work into explicit workers using database-backed queues, leases, retries, idempotency keys, and dead-letter handling.
- Store job ownership and heartbeat timestamps; reclaim stale leases safely.
- Ensure deploy/update/install operations are mutually exclusive at the correct resource scope.
- Provide an operations view for queued, running, retrying, failed, canceled, and abandoned jobs.

### REL-04 — Terminal cleanup and startup reconciliation use N+1 database operations

**Priority:** P2
**Risk:** Slow startup and cleanup under a large session history

**Evidence**

- `src/server.ts:44-73` loads terminal sessions and performs per-session history operations/saves.
- The idle cleanup interval at `src/server.ts:261-301` can connect and update records individually every minute.

**Recommendation**

- Replace per-record startup work with `updateMany`, `deleteMany`, bulk writes, or a small transaction.
- Index every cleanup predicate and verify it with `.explain()` on production-like cardinality.
- Keep startup reconciliation bounded; continue startup in degraded mode where safe and expose reconciliation health separately.
- Prevent interval overlap and record duration/error metrics.

### REL-05 — Job cancellation semantics are misleading

**Priority:** P1
**Risk:** UI says “canceled” while privileged work continues

This is most evident in the self-service job manager, but the rule should be applied across deploy, update, endpoint execution, AI Runner, backup, and network operations.

**Recommendation**

- Distinguish `cancel_requested`, `canceling`, and `canceled`.
- Mark `canceled` only after the process tree has stopped and cleanup has completed.
- If a step is non-interruptible, show that state explicitly.
- Record who requested cancellation and the final cleanup outcome.
- Make retries/idempotency safe after partial work.

---

## 3. Data, database, and API quality

### DATA-01 — Retention is inconsistent and some large collections are unbounded

**Priority:** P2
**Risk:** Silent database growth, backup bloat, degraded queries, and higher storage cost

**Positive controls already present**

- Endpoint execution logs have a 30-day TTL.
- App operation events have a 90-day TTL.
- Analytics samples have bounded retention.

**Gaps**

- `src/models/AIRunnerRun.ts:18-24`, `89-91`, and `131-136` can store stdout, stderr, and raw output up to roughly 1 MB each, plus file paths, without a TTL.
- Network speed-test results and update history have no observed TTL.
- App operation event records expire, but the operation records themselves do not have an equivalent cleanup policy.
- Endpoint logs may store request/response bodies and command output that include credentials or personal information.

**Recommendation**

1. Define retention by data class: operational logs, audit logs, metrics, command history, terminal history, AI output, update history, and generated artifacts.
2. Make retention configurable with safe defaults and minimum audit requirements.
3. Add TTL indexes where appropriate and a monitored pruning job where conditional retention is required.
4. Cap individual payloads by bytes, not characters or chunks, and avoid storing the same output in files and MongoDB without a clear purpose.
5. Add redaction for passwords, tokens, cookies, authorization headers, private keys, and configured secret names.
6. Expose storage usage, document growth, retention failures, and oldest-record age.

### DATA-02 — Alert dispatch performs repeated queries and sequential delivery

**Priority:** P2
**Risk:** Slow alert delivery and database amplification as subscriptions grow

**Evidence**

`src/lib/fleet/alerts.ts:331-403` loads enabled subscriptions, resolves channels in a per-match pattern, and sends/updates largely sequentially.

**Recommendation**

- Query matching subscriptions and referenced channels in batches.
- Cache immutable channel configuration briefly with explicit invalidation.
- Dispatch with bounded concurrency and per-destination circuit breakers.
- Persist delivery attempts with retry/backoff/dead-letter status.
- Separate alert evaluation from delivery so a slow webhook cannot block other alerts.

### DATA-03 — List APIs need consistent pagination and query limits

**Priority:** P2
**Risk:** Large response payloads, memory spikes, slow rendering, and accidental denial of service

Several list APIs return all records or use inconsistent limits, including profiles, prompts, workspaces, terminal sessions/commands, policies, alerts/channels, and backup jobs.

**Recommendation**

- Standardize cursor pagination with a hard server maximum.
- Validate positive integer limits and reject or clamp extreme values.
- Return stable sort keys and continuation cursors.
- Escape search strings or use indexed text search instead of accepting raw regular expressions.
- Select only fields needed by list views; fetch details on demand.
- Add query-duration and result-count telemetry.

### DATA-04 — API authorization, validation, and error handling are duplicated

**Priority:** P2
**Risk:** Security drift, inconsistent status codes, leaked internals, and poor client behavior

**Observed patterns**

- Some routes use Zod and centralized helpers; others manually inspect JSON fields.
- Some routes correctly use admin helpers; others only require a session or rely on the deleted proxy.
- Raw `error.message` values are frequently returned to clients.
- Invalid IDs, malformed pagination, and missing resources do not always map consistently to `400`, `404`, or `409`.

**Recommendation**

Create a route toolkit that provides:

- authenticated/public/admin/capability wrappers;
- Zod parsing for params, query, headers, and body with body-size limits;
- typed error codes and consistent `400/401/403/404/409/422/429/500/503` mapping;
- request/trace/operation IDs;
- safe logging and redaction;
- cache-control defaults;
- rate-limit hooks;
- consistent audit events for privileged mutations.

Routes that execute commands or mutate host state should require idempotency keys and return an operation resource rather than holding a request open.

---

## 4. Performance and scalability

### PERF-01 — Metrics polling continues even when no client is connected

**Priority:** P2
**Risk:** Permanent CPU/system-call overhead after the first metrics connection

**Evidence**

- `src/lib/metrics.ts:76-132` starts a recurring sample loop.
- `src/lib/metrics.ts:146-166` tracks connection count, but the polling lifecycle does not stop when the count returns to zero.
- Sampling invokes several `systeminformation` calls every two seconds.
- `src/app/api/metrics/stream/route.ts:40-54` replays the full in-memory history on each reconnect.

**Recommendation**

- Start sampling on application lifecycle when always-on metrics are intentional, or stop after an idle grace period when no consumer exists.
- Batch compatible system-information calls and measure sampling duration.
- Back off under load and avoid overlapping samples.
- Send one current snapshot plus a bounded/reduced historical window on reconnect.
- Keep a single browser-level metrics stream and distribute updates through context/store rather than opening per-widget EventSource connections.

### PERF-02 — Frontend polling is fragmented and does not share backoff or visibility state

**Priority:** P2
**Risk:** Duplicate network traffic, thundering-herd retries, stale updates, and battery/CPU waste

**Remediation status:** Materially remediated for compatible browser resources. The new shared polling registry deduplicates by complete resource key, prevents overlapping requests, pauses while hidden/offline, aborts unused requests, refreshes stale data on resume, and uses capped backoff with jitter. Ports, certificates, firewall, Nginx, hardware, security, self-service installation status, and service-log polling use the compatible shared path. Complex Apps, Databases, Services, Fleet, Update, SSE, and Socket.IO flows remain domain-local where optimistic state or durable-operation reconciliation requires specialized behavior.

The codebase contains many independent intervals, EventSource clients, and socket handlers across apps, services, ports, logs, fleet, metrics, and other modules. Polling periods range from a few seconds to a minute, with inconsistent cancellation, focus behavior, jitter, and error backoff.

**Recommendation**

- Adopt a shared query/resource layer such as TanStack Query, SWR, or a small internal equivalent.
- Deduplicate requests by key and share cached results between widgets and full pages.
- Pause nonessential polling when the document is hidden or the device is offline.
- Use exponential backoff with jitter and reset it after a successful response.
- Cancel obsolete requests using `AbortController`.
- Mark data as fresh, stale, reconnecting, or offline in the UI.
- Prefer one multiplexed stream for resources with truly live updates.

### PERF-03 — Large client components increase render and change risk

**Priority:** P2
**Risk:** Expensive rerenders, difficult profiling, state bugs, and slow feature delivery

Largest examples:

| File                                              | Approximate lines |
| ------------------------------------------------- | ----------------: |
| `src/modules/ai-runner/ui/AIRunnerPage.tsx`       |             5,348 |
| `src/modules/apps/ui/AppsPage.tsx`                |             2,192 |
| `src/modules/file-browser/ui/FileBrowserPage.tsx` |             1,243 |
| `src/modules/updates/ui/UpdatePage.tsx`           |               961 |
| `src/modules/network/ui/NetworkPage.tsx`          |               902 |
| `src/modules/endpoints/ui/EndpointsPage.tsx`      |               872 |

`AppsPage.tsx:634-668`, for example, owns many related state variables and refs, with polling and operation reconciliation intertwined at `670-797`.

**Recommendation**

1. Split by workflow and state ownership, not just visual sections.
2. Model long-running operations with a reducer/state machine: idle, submitting, accepted, queued, running, succeeded, failed, canceling, canceled.
3. Extract query/mutation hooks, log-stream handling, forms, and modal state into testable feature modules.
4. Keep frequently updating data close to the component that renders it.
5. Memoize only after profiling; prefer simpler ownership and stable props first.
6. Add React Profiler measurements for dashboard, apps, AI Runner, terminal, and fleet views.

### PERF-04 — Heavy tools are mostly loaded eagerly

**Priority:** P2
**Risk:** Larger client bundles and slower first interaction

Only a small number of dynamic imports were found despite use of CodeMirror, xterm, Recharts, Framer Motion, large editors, detailed modals, and feature-rich pages.

**Recommendation**

- Dynamically import code editors, terminal rendering, large charts, documentation viewers, and detail modals when opened.
- Keep meaningful skeletons for lazy regions.
- Use a bundle analyzer in CI and record route-level JavaScript budgets.
- Avoid importing an entire icon/chart library through broad barrels where direct imports are available.
- Prefer server components for static shells and initial metadata where the custom server architecture permits it.

Suggested initial budgets should be based on a measured baseline, then ratcheted down rather than chosen arbitrarily.

### PERF-05 — Dense logs and tables need virtualization and bounded client memory

**Priority:** P2
**Risk:** Slow scrolling and memory growth during long-running sessions

**Recommendation**

- Use byte-bounded ring buffers for terminal and streaming logs.
- Virtualize long log views and tables.
- Retain full logs on the server while displaying a configurable tail in the browser.
- Preserve search, copy, download, wrapping, timestamps, ANSI rendering, and pause/follow/autoscroll controls in a shared log viewer.
- Batch stream updates on animation frames rather than rendering on every chunk.

---

## 5. Frontend architecture, UI, UX, and accessibility

### UX-01 — Build a shared accessible dialog and drawer system

**Priority:** P1 for destructive confirmation; P2 for system-wide migration
**Risk:** Keyboard traps, focus loss, accidental destructive actions, and inconsistent mobile behavior

**Remediation status:** Completed for the shared primitives, destructive confirmation, and the high-value long-running-operation surfaces in scope. Terminal settings, file-browser settings, and mobile navigation remain candidates for later migration rather than being silently treated as complete.

**Implemented foundation**

The Apps operation log pattern is now backed by shared dialog, alert-dialog, drawer, status, controls, viewer, and full-screen log components. They centralize focus, Escape, restoration, background isolation, live/follow behavior, and autoscroll behavior.

**Resolved critical defect**

The former global Enter path could call `onConfirm()` when required verification text did not match. The implementation now uses one `canConfirm` predicate for both keyboard and button activation and includes regression coverage for verification, loading, composition, editable controls, reopen reset, and focus restoration.

**Other gaps**

- `ConfirmationModal` has a modal ref but lacks a complete trap/restore implementation.
- `src/modules/terminal/ui/TerminalSettingsModal.tsx:72-165` lacks complete dialog semantics, labeling, Escape behavior, focus trapping, and restoration.
- File browser settings follow a similar one-off modal pattern.
- The mobile sidebar in `src/components/layout/ProShell.tsx:240-253` behaves like a drawer but lacks full dialog semantics, focus containment, Escape handling, and background inertness.

**Recommendation**

Create shared `Dialog`, `AlertDialog`, `Drawer`, and `FullscreenLogDialog` primitives that provide:

- portal rendering;
- `role="dialog"`/`alertdialog`, `aria-modal`, and title/description relationships;
- initial focus, focus trap, and focus restoration;
- Escape and backdrop policy;
- inert or correctly hidden background content;
- scroll locking without layout shift;
- mobile safe-area support;
- disabled/pending behavior;
- prevention of accidental Enter confirmation while typing, composing, or failing verification.

The Enter handler must call the exact same `canConfirm` predicate used by the button.

### UX-02 — Restore zoom and support reduced motion

**Priority:** P1 for zoom; P2 for motion
**Risk:** Accessibility barriers for low-vision and motion-sensitive users

**Remediation status:** Completed for the requested scope. The viewport no longer caps scaling, Framer Motion respects the user's preference at the application root, global CSS removes nonessential motion/smooth scrolling when requested, and the remaining repeating health animation has a stable state.

**Original evidence**

- `src/app/layout.tsx:29-33` sets `maximumScale: 1`, preventing normal user zoom on mobile browsers.
- Framer Motion and repeating animations appear throughout the UI, but no `prefers-reduced-motion` or `useReducedMotion` handling was found.

**Recommendation**

- Remove `maximumScale: 1` and do not disable pinch zoom.
- Add a global reduced-motion CSS policy and use Framer Motion’s reduced-motion facilities.
- Stop decorative infinite animation when reduced motion is requested.
- Replace movement-heavy transitions with opacity or instant state changes.
- Test at 200% and 400% browser zoom and with large system text.

### UX-03 — Add route-level loading, error, and not-found boundaries

**Priority:** P2
**Risk:** Blank or unstable screens and poor recovery from feature-level failures

No Next.js `loading.tsx`, `error.tsx`, or `not-found.tsx` files were found, and Suspense usage is minimal. Broad `suppressHydrationWarning` on both `html` and `body` in `src/app/layout.tsx:42-43` can hide real mismatches.

**Recommendation**

- Add global and feature-scoped loading/error/not-found boundaries.
- Provide retry actions, a short safe error summary, operation/request ID, and a route back to a stable screen.
- Preserve the shell/navigation when a feature fails.
- Use skeletons only where layout is predictable; use honest progress states for queued/running operations.
- Limit hydration-warning suppression to the smallest element that genuinely needs it.
- Add a top-level fatal-error path for asset/chunk failures.

### UX-04 — Standardize long-running operation UX

**Priority:** P2
**Risk:** Users cannot tell whether an action was accepted, is running, failed, or is safe to retry

**Remediation status:** Completed for Apps, Updates, Cron, AI Runner, self-service installation, Fleet operation results, endpoint execution output, and service logs. Domain timelines, command metadata, request/response panels, rollback/done actions, and service log metadata were retained instead of flattened into a generic view.

The app deployment work now offers a good direction: action labels explain intent, conflicting actions are disabled, and logs can open full screen. Apply the same operation model across updates, backups, self-service installation, cron execution, endpoint execution, network tests, fleet commands, and AI Runner.

**Recommended interaction contract**

1. Before action: explain what will happen, expected downtime, scope, prerequisites, and rollback behavior.
2. Submitting: disable duplicate submission and show “Requesting…” rather than “Running.”
3. Accepted/queued: show an operation ID and queue position when available.
4. Running: show current phase, elapsed time, cancel availability, live log freshness, follow, autoscroll, wrap, copy, download, and full-screen controls.
5. Succeeded: show result, duration, release/version change, health-check outcome, and next action.
6. Failed: show a concise cause first, preserve complete logs, identify the failed phase, and offer safe retry/rollback when valid.
7. Reconnect: resume the same durable operation by ID; never create a duplicate merely because a browser refreshed.

Use one status vocabulary everywhere and distinguish accepted, queued, claiming, running, cancel requested, canceled, failed, and succeeded internally. The user-facing summary can omit infrastructure-only queue details unless they explain a delay.

### UX-05 — Improve dense operational tables and responsive behavior

**Priority:** P2
**Risk:** Important information becomes hard to scan or operate on smaller screens

**Recommendation**

- Create a shared data-view toolbar with search, filters, sort, refresh/freshness, saved views, and bulk actions.
- Use sticky headers/identity columns where helpful.
- Provide responsive column priority and a deliberate mobile card/detail pattern; do not merely squeeze every desktop column.
- Keep touch targets at least 44×44 CSS pixels. Several compact settings inputs/buttons are closer to 32 pixels.
- Use text or icons plus color for status, never color alone.
- Display exact timestamps on demand and relative freshness in the main view.
- Keep row actions keyboard accessible and avoid hover-only controls.
- Add empty, first-use, no-results, loading, stale, offline, permission-denied, and error states for every major table.

### UX-06 — Charts and live status need accessible alternatives

**Priority:** P2
**Risk:** Screen-reader users cannot interpret trends or changing status

**Recommendation**

- Give each chart an accessible name and concise trend summary.
- Provide a small table or downloadable data alternative for important operational charts.
- Announce only meaningful state changes with `aria-live`; do not announce every metrics sample or log line.
- Ensure chart colors pass contrast and remain distinguishable in common color-vision deficiencies.
- Add keyboard-accessible tooltips or data inspection where charts support interaction.

### UX-07 — Establish a measurable design-system quality bar

**Priority:** P3
**Recommendation**

- Consolidate status badges, buttons, inputs, dialogs, drawers, tables, log viewers, toasts, tooltips, and operation timelines.
- Define token-level contrast, focus-ring, typography, spacing, radius, shadow, density, and motion rules.
- Avoid very small secondary copy in dense dashboard cards; target readable defaults and test browser zoom.
- Keep one primary action per surface and move uncommon/destructive actions into clearly labeled secondary areas.
- Add Storybook or an equivalent component harness only if it will be maintained and run in CI; otherwise keep focused component test pages.

---

## 6. Testing and quality engineering

### TEST-01 — Strong test count, but critical risk paths lack coverage

**Priority:** P1

**Current results**

| Check               | Result                               |
| ------------------- | ------------------------------------ |
| Vitest              | 633 files passed; 5,087 tests passed |
| Statements          | 72.61%                               |
| Lines               | 74.28%                               |
| Functions           | 70.46%                               |
| Branches            | 63.00%                               |
| Coverage thresholds | None configured                      |

The overall suite is a strong foundation, but aggregate coverage hides critical holes. Self-service command construction, cancellation, setup races, terminal ownership, authorization defaults, lifecycle shutdown, and dependency-sensitive network code need risk-based coverage first.

**Recommendation**

1. Add minimum global thresholds and higher thresholds for authentication, authorization, command execution, installers, and operation state machines.
2. Ratchet thresholds upward gradually; do not set an arbitrary number that encourages low-value tests.
3. Add mutation or adversarial tests for authorization and command construction.
4. Test failure paths, timeouts, cancellation, retries, restart recovery, concurrency, and duplicate requests.
5. Fail Codecov checks when coverage of changed critical files declines.
6. Remove React `act(...)` warnings so test output is trustworthy and future regressions remain visible.

### TEST-02 — Browser coverage is too small for the UI surface

**Priority:** P1
**Risk:** Integration regressions pass unit tests and reach releases

**Remediation status:** Improved but still open. The existing Apps Chromium smoke spec passes, and an authenticated real-browser validation covered destructive confirmation focus/Enter behavior, nested dialog focus restoration, live versus historical log controls, disabled actions during deployment, a 390×844 viewport, reduced motion, zoom metadata, and horizontal overflow. The repository still has only one Playwright spec and CI still needs a durable cross-browser smoke matrix.

Only one Playwright spec was found, even though the configuration defines Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari projects. Browser tests are not run by the current GitHub workflows.

**Minimum browser smoke matrix**

- first-run setup and bootstrap security;
- login, logout, expiry, revoked user, and permission-denied behavior;
- admin versus standard-user navigation and direct API attempts;
- app deploy/update success, failure, reconnect, logs, follow/autoscroll, cancel, and duplicate-click prevention;
- terminal create/reattach/ownership/disconnect/resize/close;
- service action and system reboot confirmation;
- endpoint creation/execution and public-token/rate-limit behavior;
- update and rollback flow;
- responsive navigation, dialogs, tables, and keyboard-only operation;
- offline/reconnect and server restart recovery.

Run a small Chromium smoke set on every pull request, then a fuller cross-browser/mobile set nightly or before release.

### TEST-03 — Accessibility needs automated and manual regression coverage

**Priority:** P2

Add:

- axe checks for key pages and all shared dialogs/drawers;
- keyboard-only Playwright flows;
- focus order/trap/restore assertions;
- 200% zoom and narrow viewport screenshots;
- reduced-motion checks;
- screen-reader-oriented semantic tests for live regions, charts, tables, and status labels.

Automated checks do not replace periodic VoiceOver/NVDA testing, especially for terminal, log streams, and complex tables.

---

## 7. CI/CD, installer, and release engineering

### CI-01 — Local quality baseline is repaired, but the release gate remains incomplete

**Priority:** P1
**Risk:** A release can be created from code that does not satisfy repository rules

**Evidence**

- The remediation fixed the original 45 TypeScript errors, 106-file formatting drift, and 7 lint warnings; `pnpm typecheck`, `pnpm format:check`, and `pnpm lint` now pass locally.
- `.github/workflows/quality.yml` runs release contract, lint, and type checking but not format checking.
- `vitest.config.ts:23-28` defines coverage reporting but no thresholds.
- `tsconfig.json` includes much of the test tree while excluding only `src/**/*.spec.ts`, producing inconsistent test type-check behavior.

**Recommendation**

1. Preserve the repaired type-check baseline instead of excluding tests from type safety. If needed, create explicit `tsconfig.app.json` and `tsconfig.test.json` and run both.
2. Add the now-green `format:check` to the required workflow.
3. Preserve zero lint warnings and make the workflow reject warning regressions.
4. Make one canonical `pnpm check` run formatting, lint, application/test type checks, unit tests, build/release contract, and the selected audit/browser gates.
5. Add workflow timeouts, concurrency cancellation, and reusable jobs/artifacts to reduce three separate installs/builds.

### CI-02 — Release and auto-tag flows are not tied to the full quality gate

**Priority:** P1
**Risk:** Tags and release artifacts can be produced from failing commits

**Evidence**

- `.github/workflows/release.yml` validates the release contract and builds but is not shown depending on the full quality/test/browser/security suite.
- `.github/workflows/auto-tag.yml` tags main pushes independently of quality completion.
- Auto-merge is enabled broadly for non-draft PRs to main, which is only safe when strict branch protection and all required checks are enforced externally.

**Recommendation**

- Make a single immutable commit SHA pass all required checks before it can be tagged or released.
- Trigger tagging from a successful required workflow or have the release workflow call the same reusable verification workflow.
- Require explicit auto-merge labels/allowlists for high-risk changes.
- Confirm branch protection requires current checks, blocks force pushes/deletions, and dismisses stale approvals.
- Sign tags/releases and publish checksums, SBOM, and build provenance.

### CI-03 — Package-manager versions and install behavior are not reproducible

**Priority:** P1
**Risk:** Environment drift between local development, CI, installer, and releases

**Evidence**

- GitHub workflows pin pnpm 9.
- recent deployment output used pnpm 10.32.0.
- `package.json` has no `packageManager` field.
- `scripts/install.sh:484` installs the latest global pnpm.
- `scripts/install.sh:588` falls back from `pnpm install --frozen-lockfile` to an unfrozen install.

**Recommendation**

- Add an exact `packageManager` value and use Corepack in local setup, CI, installer, and release builds.
- Remove the unfrozen production fallback. A lockfile mismatch should fail loudly.
- Pin Node.js and MongoDB compatibility ranges and verify them in a support matrix.
- Build release artifacts only in a clean, reproducible environment.

### DEPLOY-01 — Installer supply chain and service hardening can improve

**Priority:** P1/P2

**Positive foundations**

- The installer uses release directories and a current symlink.
- Environment file permissions are restricted.
- A non-root service account is used by default.
- Systemd restart/resource controls and Nginx proxy support are present.

**Gaps**

- `scripts/install.sh:474-476` uses a remote `curl | bash` NodeSource setup path.
- pnpm is installed unpinned.
- Release artifacts contain a large application/source/dependency surface without an SBOM or signed provenance.
- Systemd units lack a comprehensive set of sandboxing controls. Because ServerMon intentionally manages host resources, hardening must be capability-specific rather than blindly denying required access.
- Upgrade stops the service and switches releases, but an automated health-failure rollback to the prior release is not complete.
- Nginx headers omit a tested CSP, HSTS, and Permissions Policy; an obsolete XSS header is present.

**Recommendation**

1. Download versioned repository/bootstrap assets, verify signatures/checksums, and avoid unverified pipe-to-shell execution.
2. Pin and verify Node/pnpm and all release inputs.
3. Generate a CycloneDX/SPDX SBOM and provenance attestation.
4. Add systemd protections such as `NoNewPrivileges`, `PrivateTmp`, filesystem protections, syscall/address-family restrictions, and a minimal capability set, then explicitly grant only the host controls each service needs.
5. Separate privileged helpers from the web UI and expose a narrow authenticated local protocol.
6. Perform upgrade as stage → migrate/check → switch → restart → health/readiness probe → automatic rollback on failure.
7. Exercise install, upgrade, failure rollback, and uninstall in disposable VMs as part of release qualification.

---

## 8. Observability and supportability

### OBS-01 — Logging lacks a consistent correlation and redaction contract

**Priority:** P2

`src/lib/logger.ts:1-36` uses console-based logging without a fully enforced structured schema. Some operations carry IDs, but request, actor, trace, job, worker, and resource context is not consistently propagated.

**Recommendation**

- Emit structured JSON in production with timestamp, level, service, version, host, request ID, operation ID, job ID, actor ID, resource ID, error class, and duration.
- Centralize redaction for cookies, authorization headers, tokens, passwords, private keys, database URLs, and configurable secret names.
- Return a safe request/operation ID to users on failures.
- Add counters/histograms for route latency/errors, DB queries, active sockets/SSE, scheduler drift, queue depth, retries, cancellations, webhook delivery, health failures, and log drops.
- Consider OpenTelemetry for traces and metrics, plus a compatible error tracker, without exposing terminal or command contents by default.

### OBS-02 — Errors are often swallowed or lose actionable context

**Priority:** P2

Examples include agent log delivery using `.catch(() => {})` in `src/server.ts:117-145` and many best-effort background paths that do not emit durable failure metrics.

**Recommendation**

- Classify expected/retryable/fatal errors.
- Log once at the correct ownership boundary with context.
- Count dropped events and surface degraded subsystems in readiness/admin diagnostics.
- Add bounded retries with jitter and a dead-letter path rather than silent failure.
- Avoid returning internal stack or command details to API clients.

### OBS-03 — Add operational runbooks and recovery drills

**Priority:** P2

Create tested runbooks for:

- database unavailable or migration failure;
- failed deploy/update and rollback;
- stuck queued/claimed operation;
- worker unavailable or duplicate leader;
- terminal/PTY leak;
- webhook storm;
- disk/database growth;
- compromised admin/session secret rotation;
- dependency/security incident;
- restore from backup and disaster recovery.

Each runbook should include detection, safe containment, verification, rollback/recovery, and evidence collection.

---

## 9. Maintainability and architecture

### ARCH-01 — Oversized services and route files concentrate risk

**Priority:** P2

Large non-UI examples include:

| File                                               | Approximate lines |
| -------------------------------------------------- | ----------------: |
| `src/app/api/modules/endpoints/templates/route.ts` |             2,032 |
| `src/lib/ai-runner/service.ts`                     |             1,446 |
| `src/lib/databases/service.ts`                     |             1,322 |
| `src/lib/apps/service.ts`                          |             1,310 |
| `src/lib/crons/service.ts`                         |             1,126 |
| `src/lib/fleet/agentClient.ts`                     |             1,022 |
| `src/lib/docker/service.ts`                        |               970 |

**Recommendation**

- Separate domain policy, persistence, command construction, process execution, event publication, and HTTP mapping.
- Keep route files thin and declarative.
- Define explicit interfaces around privileged executors so they can be replaced by isolated workers/helpers.
- Prefer domain-specific result/error types over thrown generic errors.
- Add lightweight complexity/file-size reporting as an advisory first; avoid arbitrary hard limits that encourage meaningless splitting.

### ARCH-02 — Model long-running workflows as durable state machines

**Priority:** P2

Apps, updates, installs, backups, AI runs, endpoint executions, network tests, and fleet operations all share similar lifecycle problems.

Create a common operation contract with:

- immutable operation ID, actor, target, request payload hash, and idempotency key;
- explicit state and state-transition rules;
- attempt count, lease owner, heartbeat, created/started/finished timestamps;
- progress phase, user summary, structured error code, retryability, and rollback relation;
- append-only events/log cursor;
- cancel request and cancellation completion;
- retention and audit policy.

Do not force every domain into one giant service. Share the contract/repository/event semantics while keeping domain executors separate.

### ARCH-03 — Clarify the single-host versus distributed architecture contract

**Priority:** P2

ServerMon combines a Next.js web application, custom HTTP/Socket.IO server, MongoDB, local host control, PTYs, and background workers. Some state assumes one process while fleet/app workers imply distribution.

Document and enforce:

- supported number of web and worker replicas;
- which process owns each scheduler;
- how leases and failover work;
- where terminal processes live and how sessions route to them;
- which operations are host-local versus fleet-remote;
- privilege boundaries between UI, API, worker, and privileged helper;
- required network exposure and trust zones.

This architecture decision should precede ad hoc scaling changes.

---

## 10. Documentation accuracy

### DOC-01 — README security and architecture claims are stale

**Priority:** P1
**Risk:** Operators make unsafe deployment decisions based on controls that do not exist

`README.md:341-359` claims middleware-first authentication, rate limiting, per-widget error boundaries, and a single metrics SSE stream. The current code does not consistently satisfy those claims.

**Recommendation**

- Update documentation immediately after the security boundary is restored.
- Mark controls as implemented, planned, or deployment-dependent.
- Document the public-route list, role/capability model, first-run bootstrap process, secret rotation, supported proxy topology, and safe internet-exposure guidance.
- Add a threat model because the product intentionally executes commands and manages services, containers, files, firewall/network settings, and remote nodes.
- Keep architecture diagrams synchronized with the custom server, workers, database, PTY lifecycle, SSE/Socket.IO paths, and privileged helper boundary.

### DOC-02 — Add contributor and release verification documentation

**Priority:** P2

Document:

- exact Node and pnpm versions;
- local service dependencies and seed/setup flow;
- one canonical verification command;
- how to run unit, coverage, browser, installer, and security checks;
- how to add a protected/public route;
- how to add a capability and audit event;
- operation-state and cancellation conventions;
- release/tag/rollback procedure;
- dependency exception policy.

---

## Recommended implementation roadmap

## Phase 0 — Containment and release block (0–3 days)

- Disable self-service install/control endpoints.
- Reinstate default server authentication.
- Add explicit admin checks to terminal, reboot, executable endpoints, and all host mutation routes.
- Fix confirmation Enter bypass and readiness status.
- Upgrade immediately exposed vulnerable dependencies.
- Add temporary security regression tests around these changes.

**Exit condition:** no anonymous command/host-control path; no normal-user privilege escalation in tested routes/sockets; readiness accurately fails; high-risk runtime packages are patched or formally contained.

## Phase 1 — Security and quality foundation (1–2 sprints)

- Central capability policy and terminal ownership.
- Safe bootstrap, session revocation, cookie/CSRF/rate-limit/header hardening.
- Isolated custom-code execution and SSRF policy.
- Fix all type errors and format drift.
- Require unit, type, format, lint, build, audit policy, and Chromium smoke tests before merge/release.
- Pin Node/pnpm and eliminate unfrozen production installs.

**Exit condition:** one reproducible green gate on the exact release SHA and adversarial tests for privileged boundaries.

## Phase 2 — Reliability and operations (2–4 sprints)

- Durable state machines/leases/idempotency/cancellation.
- Lifecycle registry and graceful shutdown.
- Correct liveness/readiness and dependency diagnostics.
- Retention/redaction/storage telemetry.
- Batched queries, pagination, alert delivery queue, and bounded concurrency.
- Automatic release rollback and VM-based installer qualification.

**Exit condition:** restart/failure/cancel/rollback scenarios are deterministic and observable.

## Phase 3 — Frontend performance and UX (parallel, 2–6 sprints)

- Shared query/cache/stream layer.
- Accessible dialog/drawer/log/data-view primitives.
- Route loading/error/not-found boundaries.
- Split large workflow components and lazy-load heavy features.
- Virtualize long logs/tables; add stale/offline/freshness semantics.
- Restore zoom, reduced motion, accessible chart alternatives, and mobile touch targets.

**Exit condition:** core workflows pass keyboard, mobile, reduced-motion, zoom, browser, and performance budgets.

## Phase 4 — Architecture and documentation maturity (ongoing)

- Explicit single-instance/distributed contract.
- Separate privileged helper/worker boundaries.
- Structured observability and runbooks.
- Accurate threat model, architecture docs, contributor guide, SBOM, provenance, and recovery drills.

---

## Suggested measurable quality targets

These should be baselined and ratcheted rather than imposed all at once.

| Area                 | Initial target                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| P0/P1 security paths | 100% of routes/events classified by public/auth/capability policy                                                  |
| Type safety          | 0 type-check errors in application and test configs                                                                |
| Formatting           | 0 format drift                                                                                                     |
| Lint                 | 0 warnings on changed code, then repository-wide 0                                                                 |
| Coverage             | No decline globally; >=90% branch coverage for auth/policy/command construction/state transitions                  |
| Browser smoke        | Chromium on every PR; cross-browser/mobile before release                                                          |
| Accessibility        | 0 serious/critical axe issues on core flows; all dialogs pass keyboard/focus tests                                 |
| Dependency security  | 0 unapproved high/critical production vulnerabilities                                                              |
| Readiness            | Required dependency failure produces `503` within a bounded time                                                   |
| Shutdown             | Drains or safely terminates within the configured deployment grace period                                          |
| Operations           | Every long-running mutation has an ID, durable state, actor, logs, idempotency, and cancellation semantics         |
| Performance          | Route bundle, API latency, query count, stream count, and render budgets measured and enforced against regressions |

## Positive foundations worth preserving

This audit is intentionally risk-focused, but several existing choices are good foundations:

- The test suite is large and fast enough to be useful as a release gate.
- Many high-volume models already have thoughtful indexes and some TTL policies.
- Mongo connection pooling/caching is centralized.
- GitHub Actions are pinned to commit SHAs.
- The installer uses release directories, a current symlink, restricted environment permissions, and a non-root service account by default.
- Apps have durable operation/event concepts and a separate worker.
- Shared accessible overlays and operation logs now give Apps and other high-value long-running workflows consistent focus behavior, statuses, errors, Follow/Autoscroll/Wrap, copy/download, and full-screen output.
- Compatible browser polling is deduplicated and visibility/connectivity-aware, while specialized streams and optimistic state machines remain domain-owned.
- Browser zoom and user reduced-motion preferences are respected.
- Several newer APIs use Zod and explicit admin helpers; those patterns can be standardized rather than invented again.
- The UI already has a coherent visual language and useful operational density. Accessibility and shared primitives can improve it without a full redesign.

## Verification performed for this audit and remediation

| Verification                                                            | Outcome                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Repository/project instructions reviewed                                | Completed                                                        |
| Source/API/model/test inventory                                         | Completed                                                        |
| Backend, custom server, worker, command-execution, and installer review | Completed                                                        |
| Frontend architecture, UI, responsive, and accessibility review         | Completed                                                        |
| GitHub workflows and release flow review                                | Completed                                                        |
| `pnpm test`                                                             | Passed: 633 files / 5,087 tests                                  |
| `pnpm test:coverage`                                                    | Passed; 72.61% statements / 63.00% branches                      |
| `pnpm build`                                                            | Passed                                                           |
| Release contract                                                        | Passed                                                           |
| `pnpm typecheck`                                                        | Passed: 0 errors after remediation                               |
| `pnpm format:check`                                                     | Passed: 0 files with drift after remediation                     |
| `pnpm lint`                                                             | Passed: 0 warnings after remediation                             |
| Focused operation/polling/feature tests                                 | Passed: 19 files / 196 tests and 20 files / 142 tests            |
| `pnpm exec playwright test e2e/apps.spec.ts --project=chromium`         | Passed: 1 test                                                   |
| Authenticated real-browser accessibility validation                     | Passed on desktop, 390×844, and reduced-motion configurations    |
| `pnpm audit --prod`                                                     | Failed policy expectation: 45 vulnerabilities, including 23 high |
| `pnpm outdated`                                                         | Reviewed for available remediation versions                      |

## Audit limitations

This was a code, configuration, dependency, and automated-test review. It was not a formal penetration test, production load test, full manual screen-reader certification, disaster-recovery exercise, or clean-VM installer qualification. Findings involving reachability depend on the deployment network and reverse-proxy configuration, but application-layer authorization should not depend on an undocumented external firewall. Dynamic security testing, load profiling, browser bundle measurement, database query plans on production-scale data, and VM-based upgrade/rollback tests should follow the P0 containment work.

## Definition of done for the overall improvement program

The program is complete when:

1. Every route and socket event has an explicit public/authenticated/capability policy.
2. No untrusted string reaches a shell or in-process dynamic evaluator without isolation and strict validation.
3. Normal users cannot cross resource ownership or host-control boundaries.
4. Setup, login, session revocation, cookies, CSRF/origin, rate limits, and security headers are tested.
5. Long-running work is durable, idempotent, cancelable, recoverable, and observable.
6. Required checks are green on the exact commit that is tagged and released.
7. Core user journeys pass desktop/mobile, keyboard, reduced-motion, zoom, accessibility, and reconnect tests.
8. Storage, query load, background work, shutdown, upgrade, and rollback behavior remain bounded under production-like tests.
9. Documentation accurately describes the implemented security and operational model.
