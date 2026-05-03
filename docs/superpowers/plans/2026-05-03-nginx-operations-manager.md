# Nginx Operations Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete local Nginx manager that discovers loaded configs, shows full virtual host details, and creates direct or wildcard managed hosts safely.

**Architecture:** Add focused backend utilities under `src/lib/nginx/` for parsing, discovery, rendering, DNS checks, and managed file operations. Extend the existing `/api/modules/nginx` routes and standalone `src/modules/nginx` UI without coupling it to Fleet FRP routes.

**Tech Stack:** Next.js App Router API routes, TypeScript, Zod, Vitest, React Testing Library, existing ServerMon UI components.

---

### Task 1: Parser And Discovery

**Files:**

- Create: `src/lib/nginx/parser.ts`
- Create: `src/lib/nginx/discovery.ts`
- Modify: `src/lib/nginx/service.ts`
- Modify: `src/modules/nginx/types.ts`
- Test: `src/lib/nginx/parser.test.ts`
- Test: `src/lib/nginx/discovery.test.ts`

- [ ] **Step 1: Write parser tests**

Add tests that parse a Certbot-modified config with `server_name api-test.apps.example.com`, `ssl_certificate`, redirect block, `location /`, and `proxy_pass http://127.0.0.1:8080`. Add a wildcard case for `server_name *.apps.example.com`.

- [ ] **Step 2: Run parser tests red**

Run: `pnpm test src/lib/nginx/parser.test.ts`

Expected: fails because `parseNginxServerBlocks` does not exist.

- [ ] **Step 3: Implement parser**

Create `parseNginxServerBlocks(raw, sourcePath)` and structured types for `listen`, `tls`, `locations`, `redirects`, `warnings`, and raw blocks.

- [ ] **Step 4: Write discovery tests**

Mock `execFile`, `readdir`, and `readFile`. Verify `nginx -T` discovery returns `/etc/nginx/servermon/app-test.conf` as loaded. Verify fallback scans `/etc/nginx/servermon` even when `/etc/nginx/sites-available` exists.

- [ ] **Step 5: Run discovery tests red**

Run: `pnpm test src/lib/nginx/discovery.test.ts`

Expected: fails because discovery helpers do not exist.

- [ ] **Step 6: Implement discovery and wire snapshot**

Use `nginx -T` as primary source, parse source-file comment markers, and fall back to all known directories. Update `nginxService.getSnapshot()` to use discovery.

- [ ] **Step 7: Run tests green**

Run: `pnpm test src/lib/nginx/parser.test.ts src/lib/nginx/discovery.test.ts src/lib/nginx/service.test.ts`

Expected: pass.

### Task 2: Rich Nginx UI Details

**Files:**

- Modify: `src/modules/nginx/ui/NginxPage.tsx`
- Modify: `src/modules/nginx/ui/NginxWidget.tsx`
- Test: `src/modules/nginx/ui/NginxPage.test.tsx`

- [ ] **Step 1: Write UI tests**

Add tests that render TLS certificate/key paths, source path, wildcard badge, redirect target, location proxy target, managed/loaded labels, and raw config.

- [ ] **Step 2: Run UI tests red**

Run: `pnpm test src/modules/nginx/ui/NginxPage.test.tsx`

Expected: fails because fields are not rendered.

- [ ] **Step 3: Implement UI details**

Update the vhost cards to show the new structured fields, preserve existing controls, and keep labels compact.

- [ ] **Step 4: Run UI tests green**

Run: `pnpm test src/modules/nginx/ui/NginxPage.test.tsx src/modules/nginx/ui/NginxWidget.test.tsx`

Expected: pass.

### Task 3: Managed Config Backend

**Files:**

- Create: `src/lib/nginx/renderer.ts`
- Create: `src/lib/nginx/managed-config.ts`
- Create: `src/app/api/modules/nginx/vhosts/route.ts`
- Create: `src/app/api/modules/nginx/vhosts/[id]/route.ts`
- Test: `src/lib/nginx/renderer.test.ts`
- Test: `src/lib/nginx/managed-config.test.ts`
- Test: `src/app/api/modules/nginx/vhosts/route.test.ts`

- [ ] **Step 1: Write renderer tests**

Cover direct host rendering, wildcard host rendering, websocket headers, HTTP redirect, TLS certificate paths, body size, timeout, and headers.

- [ ] **Step 2: Run renderer tests red**

Run: `pnpm test src/lib/nginx/renderer.test.ts`

Expected: fails because renderer does not exist.

- [ ] **Step 3: Implement renderer**

Render reverse-proxy snippets to `/etc/nginx/servermon/<slug>.conf` compatible config, with strict domain and file slug validation.

- [ ] **Step 4: Write managed write tests**

Mock filesystem and config test. Verify backup, rollback on failed `nginx -t`, delete rollback behavior, and path traversal rejection.

- [ ] **Step 5: Run managed write tests red**

Run: `pnpm test src/lib/nginx/managed-config.test.ts`

Expected: fails because managed config helpers do not exist.

- [ ] **Step 6: Implement managed write helpers and API**

Add create/update/delete route handlers with auth, Zod validation, test-before-success behavior, and structured test output.

- [ ] **Step 7: Run backend tests green**

Run: `pnpm test src/lib/nginx/renderer.test.ts src/lib/nginx/managed-config.test.ts src/app/api/modules/nginx/vhosts/route.test.ts`

Expected: pass.

### Task 4: Add Host UI And DNS Guidance

**Files:**

- Create: `src/lib/nginx/dns.ts`
- Create: `src/app/api/modules/nginx/dns/check/route.ts`
- Create: `src/modules/nginx/ui/NginxHostWizard.tsx`
- Modify: `src/modules/nginx/ui/NginxPage.tsx`
- Test: `src/lib/nginx/dns.test.ts`
- Test: `src/app/api/modules/nginx/dns/check/route.test.ts`
- Test: `src/modules/nginx/ui/NginxHostWizard.test.tsx`

- [ ] **Step 1: Write DNS tests**

Cover direct domain guidance for `app.example.com`, wildcard guidance for `*.apps.example.com`, apex warning, and resolver output.

- [ ] **Step 2: Run DNS tests red**

Run: `pnpm test src/lib/nginx/dns.test.ts`

Expected: fails because DNS helpers do not exist.

- [ ] **Step 3: Implement DNS helper and API**

Use `node:dns/promises` for A, AAAA, and CNAME lookups. Return suggested DNS records and warnings.

- [ ] **Step 4: Write wizard tests**

Cover guided mode, raw mode, wildcard domain, config preview, DNS guidance text, submit success, and validation errors.

- [ ] **Step 5: Run wizard tests red**

Run: `pnpm test src/modules/nginx/ui/NginxHostWizard.test.tsx`

Expected: fails because wizard does not exist.

- [ ] **Step 6: Implement wizard and integrate into page**

Add create-host panel to the Nginx page, preview config client-side, submit to `/api/modules/nginx/vhosts`, and refresh snapshot on success.

- [ ] **Step 7: Run feature tests green**

Run: `pnpm test src/lib/nginx/dns.test.ts src/app/api/modules/nginx/dns/check/route.test.ts src/modules/nginx/ui/NginxHostWizard.test.tsx src/modules/nginx/ui/NginxPage.test.tsx`

Expected: pass.

### Task 5: Final Verification

**Files:**

- Modify only files required by failed checks.

- [ ] **Step 1: Run focused test suite**

Run: `pnpm test src/lib/nginx src/modules/nginx src/app/api/modules/nginx`

Expected: pass.

- [ ] **Step 2: Run required project checks**

Run: `pnpm lint && pnpm typecheck`

Expected: pass.

- [ ] **Step 3: Review local diff**

Run: `git diff --stat && git diff --check`

Expected: no whitespace errors and only scoped nginx/docs changes.
