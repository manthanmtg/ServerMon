# ServerMon Future Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:brainstorming` and
> `superpowers:writing-plans` to turn one roadmap item into a scoped design and
> implementation plan before changing code. Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans` to
> implement the approved plan task by task.

**Goal:** Make ServerMon safer to operate, easier to change, and more reliable to
release before expanding its feature surface.

**Architecture:** Work from risk to leverage: restore a trustworthy main branch,
close security gaps, harden CI and releases, then improve state management,
module boundaries, performance, and user experience. Deliver each roadmap item
as a small, independently testable change with an explicit rollback path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, MongoDB/Mongoose,
Socket.IO, Vitest, Playwright, pnpm, and GitHub Actions.

---

## How to Use This Roadmap

- [ ] Assign the listed owner role and a milestone before starting an item.
- [ ] Create a dedicated design and implementation plan for any item that spans
      more than one subsystem.
- [ ] Keep formatting-only, dependency, security, refactor, and feature changes
      in separate pull requests.
- [ ] Add a regression test before fixing a confirmed bug or security gap.
- [ ] Record verification output in the pull request before checking an item off.
- [ ] Run `pnpm format:check` and `pnpm check` before merging every change.
- [ ] Run the relevant Playwright smoke tests for authentication, deployment,
      rollback, terminal, or other cross-boundary changes.
- [ ] Update this file when priorities, evidence, or acceptance criteria change.

## Audit Snapshot — 2026-07-30

- [x] Fast-forwarded local `main` to `f1bc046`; it matches `origin/main`.
- [x] Confirmed `pnpm check:release-contract` passes.
- [x] Confirmed all 608 Vitest files and 4,960 tests pass.
- [x] Confirmed `pnpm format:check` fails on 109 files.
- [x] Confirmed `pnpm lint` emits 7 warnings despite the project requirement of
      zero warnings.
- [x] Confirmed `pnpm typecheck` fails with 45 errors across AI Runner, service,
      model, update, and self-service test code.
- [x] Confirmed `pnpm audit --prod` reports 20 high, 16 moderate, and 5 low
      production dependency advisories.
- [x] Confirmed the audit includes runtime paths through Next.js 16.1.6,
      Socket.IO/Engine.IO, `systeminformation`, `ws`, Sharp, PostCSS, and
      Mongoose.
- [x] Confirmed `src/proxy.ts` and its tests were removed in commit `d6d8f25`,
      while `CLAUDE.md` still says the application is protected by that file.
- [x] Confirmed 47 of 50 application pages do not perform an inline server-side
      session check and instead depend on client-side session handling.
- [x] Confirmed sensitive or host-revealing API routes lack an obvious inline
      session check, including endpoint test execution, self-service install and
      rollback, ports, network connections, and self-service history.
- [x] Confirmed 168 of 194 API routes have colocated route tests; 26 routes lack
      them, mostly in AI Runner plus self-service rollback and fleet restart.
- [x] Confirmed CI does not run `pnpm format:check` or Playwright.
- [x] Confirmed release validation checks only the release contract before
      building and publishing artifacts.
- [x] Confirmed the repository has one Playwright spec, covering the Apps module.
- [x] Confirmed 61 TypeScript/TSX files exceed 500 lines.
- [x] Confirmed the largest production units include
      `src/modules/ai-runner/ui/AIRunnerPage.tsx` at about 5,349 lines,
      `src/app/api/modules/endpoints/templates/route.ts` at about 2,033 lines,
      and `src/modules/apps/ui/AppsPage.tsx` at about 1,640 lines.
- [x] Confirmed self-service installation jobs live in an in-memory `Map`, are
      lost on restart, and cancellation does not signal the running pipeline to
      stop.
- [x] Confirmed the UI contains many independent polling intervals, including
      several simultaneous intervals in AI Runner and Fleet views.
- [x] Confirmed the test suite passes but emits substantial React `act(...)`,
      expected-error, and environment warning noise.
- [x] Confirmed 51 unresolved Markdown records exist at the top level of
      `issues_to_look/`, including stale reports that claim tests fail even
      though the current full suite passes.

## Key Decisions

- [x] Treat a green, enforceable main branch as the prerequisite for feature
      work.
- [x] Use defense in depth for authentication: route-boundary authorization is
      mandatory even when a central Next.js Proxy guard is present.
- [x] Patch the framework before reintroducing Proxy-based page protection
      because the installed Next.js version is affected by Proxy-bypass
      advisories.
- [x] Reuse one build artifact through validation and release wherever platform
      packaging permits it.
- [x] Refactor large units incrementally behind existing tests; do not perform a
      repository-wide rewrite.
- [x] Retry only idempotent operations by default. Require idempotency keys or
      explicit reconciliation for state-changing retries.
- [x] Keep new product modules out of scope until Priority 0 is complete.

## Priority 0 — Restore the Safety Baseline

### P0.1 Make Main Green and Enforce the Existing Contract

- [ ] **Owner:** Platform/quality owner.
- [ ] **Current risk:** Required checks do not pass locally, so regressions cannot
      be separated reliably from baseline failures and autonomous maintenance
      repeatedly aborts.
- [ ] Create one formatting-only pull request for the 109 files reported by
      Prettier; review generated, prompt, issue-log, and documentation diffs
      separately from source diffs.
- [ ] Fix the 7 lint warnings in
      `src/app/api/modules/disk/scan/route.test.ts`,
      `src/modules/ai-runner/ui/components/HistoryView.tsx`,
      `src/modules/crons/ui/CronsPage.tsx`,
      `src/modules/ports/ui/PortAvailabilityChecker.tsx`,
      `src/modules/security/ui/SecurityScoreOverview.tsx`, and
      `src/modules/services/ui/ServicesPage.tsx`.
- [ ] Change the lint script to fail on warnings with
      `eslint src/ --max-warnings=0`.
- [ ] Add shared `NextRequest` and `NextResponse` test builders under
      `src/test/` and use them to remove the repeated request/response type
      mismatches in AI Runner route tests.
- [ ] Fix the remaining typed-mock drift in AI Runner execution DTOs,
      `execFile` callbacks, auth verification results, Mongoose schema mocks,
      analytics mocks, and self-service executor payloads.
- [ ] Run `pnpm format:check`, `pnpm check:release-contract`, `pnpm lint`,
      `pnpm typecheck`, `pnpm build`, and `pnpm test` independently and attach
      all successful outputs to the pull request.
- [ ] Archive or resolve stale baseline-failure records in `issues_to_look/`
      after the checks pass.
- [ ] **Acceptance:** `pnpm format:check` and `pnpm check` both exit 0 from a
      clean checkout, with no lint warnings.
- [ ] **Fallback:** Revert only the failing category's pull request; keep
      formatting, test-helper, and behavior changes isolated so one rollback
      does not discard the other fixes.

### P0.2 Patch Production Dependencies

- [ ] **Owner:** Security/platform owner.
- [ ] **Current risk:** The production dependency graph reports 20
      high-severity advisories, including request bypass, SSRF, command
      injection, memory exhaustion, and file-read paths.
- [ ] Upgrade Next.js and its paired ESLint configuration to a release that
      resolves every currently reported Next.js advisory; the audit currently
      requires at least 16.2.11 for the broadest listed fixes.
- [ ] Upgrade `systeminformation` to at least 5.31.7 and add regression coverage
      around untrusted interface/profile names before invoking OS commands.
- [ ] Upgrade `ws` to at least 8.21.0.
- [ ] Upgrade Socket.IO packages until the lockfile resolves Engine.IO to at
      least 6.6.7 and `socket.io-parser` to at least 4.2.6.
- [ ] Upgrade Mongoose to at least 9.7.2 and verify all user-controlled update
      objects are built from validated allowlisted fields.
- [ ] Resolve PostCSS to at least 8.5.18 and Sharp to at least 0.35.0 through
      supported direct dependency upgrades or narrowly documented pnpm
      overrides.
- [ ] Split framework, native-module, and database upgrades into separate pull
      requests so failures and rollbacks remain attributable.
- [ ] Run unit tests, production build, Playwright smoke tests, install-script
      validation, and a local hub/agent startup smoke test after each upgrade.
- [ ] Add a scheduled and pull-request `pnpm audit --prod --audit-level high`
      gate with a documented, expiring exception mechanism.
- [ ] Add Dependabot or Renovate for grouped, low-noise pnpm and GitHub Actions
      updates.
- [ ] **Acceptance:** `pnpm audit --prod` reports zero critical and zero high
      vulnerabilities, and all required checks pass on the updated lockfile.
- [ ] **Fallback:** Revert the failing dependency group, retain compensating
      controls documented in the advisory, and block release until a patched
      compatible version is available.

### P0.3 Restore Server-Side Authentication and Authorization

- [ ] **Owner:** Application-security/backend owner.
- [ ] **Current risk:** Client-side redirects do not protect server-rendered
      pages, and several APIs can reveal host state or execute privileged work
      without an inline session check.
- [ ] Define an explicit public page/API allowlist in
      `src/lib/auth-routes.ts`; document why every public entry is required.
- [ ] After upgrading Next.js, restore a supported `src/proxy.ts` to redirect
      unauthenticated page requests and reject protected API requests early.
- [ ] Add Proxy unit tests for page redirects, API 401 responses, asset
      exclusions, valid sessions, expired sessions, and public allowlist paths.
- [ ] Add typed `requireSession()` and `requireAdmin()` helpers in
      `src/lib/api-auth.ts` that return consistent 401/403 responses.
- [ ] Require route-local authorization in
      `src/app/api/modules/endpoints/[id]/test/route.ts` before executing stored
      scripts, webhooks, or logic.
- [ ] Require admin authorization in self-service install, job, history, cancel,
      and rollback routes under `src/app/api/modules/self-service/`.
- [ ] Require a session for
      `src/app/api/modules/ports/route.ts` and
      `src/app/api/modules/network/connections/route.ts`.
- [ ] Audit all 194 route handlers and classify each as public, authenticated,
      admin-only, token-authenticated, agent-authenticated, or internal.
- [ ] Add an executable API policy test that fails when a new route is not in
      the classification manifest or does not use the required guard.
- [ ] Add unauthenticated, non-admin, expired-session, and authorized tests for
      every privileged route.
- [ ] Keep the existing Socket.IO session middleware and add authorization for
      session ownership and role-sensitive terminal events.
- [ ] Update `CLAUDE.md` only after the implemented protection matches its
      “protected by default” claim.
- [ ] **Acceptance:** Direct unauthenticated requests cannot render protected
      pages, reveal host state, start/cancel/rollback installs, or run endpoint
      tests; the public allowlist remains reachable.
- [ ] **Fallback:** Disable privileged modules at the navigation and API layers,
      keep route-local guards active, and revert Proxy routing separately if it
      causes request compatibility issues.

## Priority 1 — Harden Delivery and Runtime Reliability

### P1.1 Make CI Match the Documented Merge Contract

- [ ] **Owner:** Platform/CI owner.
- [ ] **Current risk:** Pull requests can pass CI without Prettier or E2E
      validation, and workflows repeat dependency installation while still
      leaving contract gaps.
- [ ] Add `pnpm format:check` to `.github/workflows/quality.yml`.
- [ ] Enforce zero lint warnings in both local scripts and CI.
- [ ] Add concurrency groups and explicit timeouts to build, quality, and test
      workflows.
- [ ] Pin the supported Node and pnpm versions in `package.json` using `engines`
      and `packageManager`, then reuse those versions in every workflow.
- [ ] Consolidate repeated checkout/setup/install logic into a reusable workflow
      or composite action without hiding individual status checks.
- [ ] Preserve separate required checks for format, release contract, lint,
      types, build, unit tests, security audit, and smoke tests.
- [ ] Upload JUnit, coverage, build diagnostics, and Playwright traces on failure.
- [ ] Add stable pnpm and safe Next.js build cache keys based on the lockfile,
      runtime version, and relevant configuration.
- [ ] **Acceptance:** A deliberately misformatted file, lint warning, type error,
      failing test, high vulnerability, or failed build blocks merge with a
      focused diagnostic.
- [ ] **Fallback:** Disable only a proven flaky optimization such as build
      caching; never bypass the underlying correctness or security check.

### P1.2 Gate Releases With the Same Artifact and Full Validation

- [ ] **Owner:** Release/platform owner.
- [ ] **Current risk:** `.github/workflows/release.yml` validates only the release
      contract before publishing platform artifacts.
- [ ] Make release validation run format, release contract, lint, typecheck, and
      unit tests before any packaging job starts.
- [ ] Build each platform artifact once, preserve its commit/version manifest,
      and run smoke checks against the packaged contents before publication.
- [ ] Add a Linux hub startup/health smoke test and an agent command/startup
      smoke test using isolated mock configuration.
- [ ] Verify `SHA256SUMS` before publication and during the documented install
      flow.
- [ ] Generate an SBOM and provenance attestation for every published artifact.
- [ ] Document the last-known-good artifact and rollback command in `DEPLOY.md`.
- [ ] Add a manual approval environment for production publishing if releases
      are consumed automatically by installed instances.
- [ ] **Acceptance:** Publication is impossible unless the exact packaged commit
      passes all gates and smoke tests.
- [ ] **Fallback:** Keep the prior release and checksums available, stop
      publication, and repoint update metadata to the last-known-good version.

### P1.3 Build a Practical Test and Coverage Safety Net

- [ ] **Owner:** Quality/feature owners.
- [ ] **Current risk:** Unit coverage is broad, but 26 API routes lack colocated
      tests, E2E coverage is one Apps spec, and noisy output can hide real
      warnings.
- [ ] Add route tests first for self-service rollback, fleet restart, AI Runner
      run/kill, bundle import/export, workspace mutation, profile mutation, and
      prompt-attachment upload.
- [ ] Add Playwright journeys for login/session expiry, dashboard load, terminal
      authorization, endpoint test authorization, self-service install/cancel,
      app deploy/rollback, and mobile navigation.
- [ ] Run destructive E2E paths only against explicit mock modes and isolated
      temporary data roots.
- [ ] Measure coverage after the baseline is green, set thresholds no lower than
      the measured baseline, and ratchet them upward with new work.
- [ ] Fail tests on unexpected `console.error`, unhandled rejection, open handle,
      or React `act(...)` warning while allowing explicitly asserted error-path
      logs.
- [ ] Remove the invalid `--localstorage-file` warnings and mock missing JSDOM
      browser methods such as `scrollTo` in shared test setup.
- [ ] Split the slowest suites or fixtures only after recording their current
      duration and proving the improvement.
- [ ] **Acceptance:** CI output is quiet on success, critical user journeys run
      in Playwright, and every new API route has auth/error/happy-path coverage.
- [ ] **Fallback:** Quarantine only a reproducibly flaky E2E case with an owner
      and expiry date; retain unit and integration gates.

### P1.4 Persist and Correct Self-Service Job State

- [ ] **Owner:** Self-service/backend owner.
- [ ] **Current risk:** Jobs disappear on process restart; cancellation changes
      a label but does not stop the running pipeline; concurrent callbacks can
      overwrite terminal states.
- [ ] Define an explicit job state machine with allowed transitions for pending,
      running, cancelling, cancelled, failed, completed, rolling back, and
      rolled back.
- [ ] Create a MongoDB model for job metadata, step status, sanitized logs,
      idempotency key, owner, timestamps, and recovery state.
- [ ] Make job creation idempotent so request retries cannot start duplicate
      package, Compose, or script operations.
- [ ] Thread `AbortSignal` or an equivalent cancellation token through every
      provision step and stop scheduling new steps after cancellation.
- [ ] Persist updates atomically and reject stale callbacks that attempt to
      overwrite a terminal state.
- [ ] Reconcile interrupted jobs on startup and mark states that require manual
      inspection rather than silently resuming destructive operations.
- [ ] Record rollback as a distinct outcome instead of mapping success to
      `cancelled`.
- [ ] Add restart, duplicate-request, cancel-during-step, stale-callback,
      partial-rollback, and log-redaction tests.
- [ ] **Acceptance:** Job history survives restart, duplicate submissions do not
      duplicate work, and cancellation demonstrably prevents later steps.
- [ ] **Fallback:** Disable new job creation, preserve readable job history, and
      require manual recovery commands for interrupted operations.

### P1.5 Add Security Headers, Limits, and Abuse Controls

- [ ] **Owner:** Application-security/platform owner.
- [ ] **Current risk:** `next.config.ts` defines no response security headers,
      and there is no general rate limiter for authentication or expensive host
      operations.
- [ ] Add Content Security Policy in report-only mode, collect violations, then
      enforce a policy compatible with CodeMirror, charts, WebSockets, and
      branding assets.
- [ ] Add HSTS for HTTPS deployments, `X-Content-Type-Options`, a strict
      `Referrer-Policy`, `Permissions-Policy`, and CSP `frame-ancestors`.
- [ ] Add bounded request-body sizes to upload, bundle import, endpoint test,
      webhook, setup, and authentication routes.
- [ ] Add per-IP and per-account throttling to login, passkey verification,
      setup initialization, public install-script, and other expensive public
      routes.
- [ ] Add concurrency and connection limits for Socket.IO, terminal sessions,
      SSE streams, AI Runner work, and self-service installs.
- [ ] Add audit events for privileged actions with actor, target, outcome,
      correlation ID, and redacted metadata.
- [ ] Add automated secret-redaction tests for errors, job logs, diagnostics,
      endpoint execution, app environments, and release output.
- [ ] **Acceptance:** Security headers pass an automated assertion suite, abuse
      limits return deterministic 413/429 responses, and privileged actions are
      attributable without leaking secrets.
- [ ] **Fallback:** Roll CSP back to report-only if it breaks required assets;
      keep size, rate, auth, and audit controls enabled.

## Priority 2 — Improve Maintainability, Performance, and Operations

### P2.1 Decompose the Largest Client Components

- [ ] **Owner:** AI Runner, Apps, and File Browser feature owners.
- [ ] **Current risk:** Multi-thousand-line client components combine fetching,
      polling, state machines, forms, drawers, and rendering, making changes
      expensive and increasing regression risk.
- [ ] Extract AI Runner server interactions and refresh orchestration from
      `src/modules/ai-runner/ui/AIRunnerPage.tsx` into focused hooks with typed
      inputs and outputs.
- [ ] Move AI Runner views, forms, and drawers into feature folders without
      changing their public behavior or route.
- [ ] Apply the same container/view split incrementally to
      `src/modules/apps/ui/AppsPage.tsx` and
      `src/modules/file-browser/ui/FileBrowserPage.tsx`.
- [ ] Keep one behavioral slice per pull request and move its tests with it.
- [ ] Add render-count or interaction regression tests around high-frequency
      state updates before optimizing them.
- [ ] **Acceptance:** Each extracted unit has one responsibility, colocated
      tests, and no duplicated fetch/state-transition logic.
- [ ] **Fallback:** Revert the single extracted slice; do not continue a
      big-bang decomposition if behavior parity is uncertain.

### P2.2 Split Service and Template Monoliths by Domain

- [ ] **Owner:** Backend feature owners.
- [ ] **Current risk:** Large services and a 2,000-line API template route mix
      unrelated responsibilities and make review boundaries unclear.
- [ ] Move endpoint template definitions out of
      `src/app/api/modules/endpoints/templates/route.ts` into validated,
      domain-specific modules under `src/lib/endpoints/templates/`.
- [ ] Keep the route responsible only for authentication, query validation,
      filtering, and response serialization.
- [ ] Split `src/lib/ai-runner/service.ts` by profile, prompt, schedule, run, and
      workspace responsibilities behind a stable facade.
- [ ] Split `src/lib/databases/service.ts` into deployment, explorer, runtime,
      connection, and persistence responsibilities.
- [ ] Split `src/lib/crons/service.ts` and `src/lib/apps/service.ts` only along
      transaction or lifecycle boundaries proven by current callers.
- [ ] Extract hub startup, agent startup, scheduler registration, and terminal
      socket handling from `src/server.ts`.
- [ ] Add contract tests before moving each group of functions.
- [ ] **Acceptance:** Callers depend on narrow interfaces, circular dependencies
      do not increase, and behavior remains covered through the stable facade.
- [ ] **Fallback:** Preserve the facade and revert the internal move without
      changing callers.

### P2.3 Consolidate Polling and Measure Frontend Cost

- [ ] **Owner:** Frontend performance/platform owner.
- [ ] **Current risk:** Independent intervals can duplicate requests, continue
      in background tabs, create race conditions, and trigger noisy test updates.
- [ ] Inventory polling endpoint, cadence, visibility behavior, cancellation,
      and consumer count for every page and widget.
- [ ] Reuse existing SSE/event sources where real-time data already exists.
- [ ] Introduce a shared visibility-aware polling helper with request
      deduplication, abort support, backoff, and jitter for remaining polling.
- [ ] Pause non-critical polling in hidden tabs and refresh immediately when the
      page becomes visible.
- [ ] Prevent overlapping requests when a prior poll has not completed.
- [ ] Add a bundle analyzer and record route-level JavaScript sizes for AI
      Runner, Apps, Endpoints, File Browser, Fleet, and Dashboard.
- [ ] Dynamically load CodeMirror languages, charts, terminal assets, and heavy
      dialogs only on routes or interactions that need them.
- [ ] Define route-level bundle and interaction budgets from the measured
      baseline, then enforce non-regression in CI.
- [ ] **Acceptance:** Request counts and route bundles show a measured reduction
      without stale data or slower interactions.
- [ ] **Fallback:** Restore the previous cadence for the affected module while
      retaining request cancellation and visibility guards.

### P2.4 Improve Runtime Resilience and Observability

- [ ] **Owner:** Runtime/platform owner.
- [ ] **Current risk:** Fire-and-forget work, independent schedulers, and raw
      client/server logging make partial failure difficult to diagnose.
- [ ] Add correlation IDs from HTTP and Socket.IO entry points through service
      logs and audit records.
- [ ] Replace remaining production `console.*` calls with the appropriate
      structured server logger or a defined client telemetry boundary.
- [ ] Add scheduler status, last-success, last-error, next-run, and lease-owner
      fields to runtime diagnostics.
- [ ] Add graceful shutdown for hub timers, schedulers, Socket.IO, PTYs, AI
      workers, database connections, and in-flight health checks.
- [ ] Buffer or count failed agent-to-hub log deliveries instead of silently
      dropping every error.
- [ ] Add idempotency or reconciliation before retrying app deploy, update,
      rollback, or other state-changing operations.
- [ ] Use bounded retries only for idempotent discovery and health checks.
- [ ] Add health signals for queue depth, stale workers, SSE connections,
      terminal sessions, database state, and last successful scheduler runs.
- [ ] **Acceptance:** Operators can identify the first failed boundary from one
      correlation ID, and shutdown/restart tests leave no orphan work.
- [ ] **Fallback:** Disable the affected scheduler or worker through a documented
      flag and continue serving read-only diagnostics.

### P2.5 Finish Accessibility and Mobile Hardening

- [ ] **Owner:** Frontend/accessibility owner.
- [ ] **Current risk:** Previous accessibility and mobile improvements were
      repeatedly reverted because the baseline could not be verified.
- [ ] Add `aria-invalid`, `aria-describedby`, and associated error text to shared
      form controls.
- [ ] Add `aria-busy` and disabled semantics to asynchronous buttons and regions.
- [ ] Verify dialog focus trap, focus restoration, Escape behavior, and
      accessible names across shared modals and drawers.
- [ ] Fix known narrow-width truncation and overflow in AI Agents, AI Runner,
      Ports, Fleet, and dense data tables.
- [ ] Enforce 44px touch targets on shared controls and newly touched module
      actions.
- [ ] Add keyboard-only, reduced-motion, high-contrast, and mobile viewport
      Playwright checks for critical journeys.
- [ ] Add automated accessibility checks to representative shared-component and
      route tests.
- [ ] **Acceptance:** Critical journeys are keyboard operable, screen-reader
      state is exposed, and supported mobile viewports have no unintended
      horizontal page overflow.
- [ ] **Fallback:** Revert the affected component change while retaining its
      failing accessibility regression test for the next iteration.

### P2.6 Reconcile Documentation and Maintenance Backlogs

- [ ] **Owner:** Documentation/repository-maintenance owner.
- [ ] **Current risk:** Source-of-truth docs contain stale architecture claims,
      and repeated autonomous failures have produced a noisy issue backlog.
- [ ] Reconcile `CLAUDE.md`, `README.md`, `PRD.md`, and `DEPLOY.md` against the
      implemented authentication, release, runtime, and environment behavior.
- [ ] Add a short architecture document for request authentication, background
      schedulers, real-time transports, and long-running job ownership.
- [ ] Add operator runbooks for dependency incidents, failed upgrades, database
      outages, stuck jobs, terminal cleanup, backup restore, and rollback.
- [ ] Deduplicate `issues_to_look/`, move resolved records to `resolved/`, and
      link remaining unique issues to this roadmap or an issue tracker.
- [ ] Remove placeholder documentation such as `docs/dummy-pr.md` if no current
      workflow depends on it.
- [ ] Add a monthly maintenance checklist for dependency audit, stale issue
      review, restore drill, release smoke test, and documentation drift.
- [ ] **Acceptance:** Every operational claim names the source file or command
      that proves it, and the unresolved issue folder contains only unique,
      current work.
- [ ] **Fallback:** Revert inaccurate documentation independently; never leave a
      claim that is known to disagree with production behavior.

## Candidate Files and Areas

- [ ] Modify `package.json` and `pnpm-lock.yaml` for runtime pins, patched
      dependencies, zero-warning lint, and audit commands.
- [ ] Modify `.github/workflows/quality.yml`, `build.yml`, `test.yml`, and
      `release.yml` for complete gates, caching, artifacts, and safe publishing.
- [ ] Create `.github/dependabot.yml` or the equivalent Renovate configuration.
- [ ] Create `src/proxy.ts` and `src/proxy.test.ts` after the framework upgrade.
- [ ] Create `src/lib/api-auth.ts`, its tests, and an explicit API policy
      manifest/test.
- [ ] Modify the privileged and host-revealing routes named in P0.3.
- [ ] Modify `vitest.config.ts`, `playwright.config.ts`, and `src/test/setup.ts`
      for coverage, clean output, and deterministic browser mocks.
- [ ] Add focused E2E specs under `e2e/` for auth and critical operations.
- [ ] Create a persisted self-service job model under `src/models/` and refactor
      `src/modules/self-service/engine/` around the state machine.
- [ ] Modify `next.config.ts` for reviewed security headers and measured
      framework settings.
- [ ] Refactor the large UI, service, template, and server files named in
      Priority 2 through dedicated plans.
- [ ] Update `CLAUDE.md`, `README.md`, `DEPLOY.md`, and focused operational docs
      only when implementation changes make those updates true.

## Rollout and Rollback Rules

- [ ] Finish all Priority 0 items before accepting new modules or broad visual
      redesigns.
- [ ] Land dependency upgrades in isolated groups and deploy a canary/self-host
      test instance before general release.
- [ ] Land authentication as defense in depth: route-local guards first, tests
      second, Proxy page protection third, documentation last.
- [ ] Introduce CSP in report-only mode before enforcement.
- [ ] Migrate in-memory jobs with a dual-read or one-time reconciliation path;
      never discard a running or failed job silently.
- [ ] Keep old and new internal service implementations behind one stable
      facade during incremental extraction.
- [ ] Preserve the last-known-good release artifact and documented restore
      procedure for every release hardening change.
- [ ] Attach an explicit feature-disable or read-only fallback to every
      background worker and destructive operation.

## Roadmap Definition of Done

- [ ] Priority 0 is complete and verified from a clean checkout.
- [ ] CI enforces every documented merge requirement.
- [ ] Releases are built from a validated commit, smoke-tested, attributable,
      checksummed, and rollback-ready.
- [ ] Protected pages and APIs reject unauthenticated and unauthorized access at
      server boundaries.
- [ ] Production audit has no unaccepted critical or high advisories.
- [ ] Critical operations survive restart or fail into an explicit recoverable
      state.
- [ ] Critical user journeys have quiet unit/integration output and E2E
      coverage.
- [ ] Large components and services are being reduced through tested,
      reversible slices rather than a rewrite.
- [ ] Performance and reliability improvements include before/after evidence.
- [ ] Documentation matches implemented behavior and unresolved issues are
      current, unique, and owned.
