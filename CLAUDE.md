# CLAUDE.md — Unified Project Guidelines for ServerMon

This file is the single source of truth for all project rules, coding conventions, and automated agent requirements.

## Mandatory Checks & Pre-merge Requirements

Every change (PR or commit to `main`) **must** satisfy these requirements:

| Check  | Command          | Expectation          |
| ------ | ---------------- | -------------------- |
| Format | `pnpm format`    | 0 changes needed     |
| Lint   | `pnpm lint`      | 0 errors, 0 warnings |
| Types  | `pnpm typecheck` | 0 errors             |
| Build  | `pnpm build`     | Exit code 0          |
| Tests  | `pnpm test`      | Exit code 0          |

Shortcut: `pnpm check` runs all of the above in sequence. **A failure in any step blocks the merge.**

---

## Project Overview

ServerMon is a self-hosted server monitoring platform built with Next.js 16 (App Router), TypeScript, MongoDB, and Tailwind CSS 4. It follows a modular architecture where features (terminal, processes, logs, metrics) are independent modules that register into a core shell.

---

## Repository Health Rules

### No Ignored Errors
- Do not add `eslint-disable` comments without a paired explanation comment.
- Do not add `@ts-ignore` or `@ts-expect-error`. Fix the type issue instead.
- Do not add `any` types. Use `unknown` and narrow with type guards.

### No Dead Code
- Remove unused imports, variables, functions, and files.
- Do not comment out code and commit it. Use Git history instead.

### No Secrets
- Never commit `.env`, `.env.local`, credentials, API keys, or tokens.
- `.env.example` is the only env file that should be tracked.

### No Large Files
- `.pnpm-store/`, `node_modules/`, `.next/`, and build artifacts must never be committed.
- These are in `.gitignore`. If git tries to track them, something is wrong.

### Dependency Hygiene
- Use `pnpm` exclusively. Do not use npm or yarn.
- Do not add dependencies without a clear need.
- Pin major versions in `package.json`. Use `^` for minor/patch.

---

## File Conventions & Component Checklists

### Naming
| Type       | Convention                           | Example                          |
| ---------- | ------------------------------------ | -------------------------------- |
| Pages      | `page.tsx` in route folder           | `src/app/dashboard/page.tsx`     |
| API routes | `route.ts` in API folder             | `src/app/api/health/route.ts`    |
| Components | PascalCase `.tsx`                    | `ProShell.tsx`, `Button.tsx`     |
| Utilities  | camelCase `.ts`                      | `utils.ts`, `logger.ts`          |
| Types      | PascalCase interface, camelCase file | `module.ts` → `Module` interface |
| Modules    | lowercase folder name                | `src/modules/terminal/`          |

### New Component Checklist (`src/components/ui/`)
1. Use `forwardRef` for elements that accept refs.
2. Accept a `className` prop and merge with `cn()`.
3. Use semantic theme tokens — **never hardcode colors** (e.g. `bg-slate-900`).
4. Export the component and its props type.
5. Ensure minimum 44px touch target (`min-h-[44px]`).

### New Module Checklist (`src/modules/<name>/`)
1. Create `module.ts` with the `Module` interface.
2. Create UI in `ui/` subfolder.
3. Register the widget in `src/components/modules/ModuleWidgetRegistry.tsx`.
4. Add the nav entry in `src/components/layout/ProShell.tsx` `navGroups`.
5. Create the page route in `src/app/<name>/page.tsx` wrapped in `<ProShell>`.
6. Run `pnpm check` to verify.

### New API Route Checklist
1. Wrap handler body in try/catch.
2. Use `createLogger('api:<name>')`.
3. Return `{ error: "message" }` on failures with proper HTTP status.
4. Add `export const dynamic = 'force-dynamic'` if accessing DB or runtime state.
5. Validate input with Zod if accepting a request body.
6. **Security**: Ensure all routes require authentication via `getSession()`.

---

## Testing Guidelines

Tests use **Vitest** for unit/integration and **Playwright** for E2E.

- **Unit Tests**: Place tests next to the file: `file.test.ts` or `ui/Component.test.tsx`.
- **Mocking**: Use `vi.mock()` for dependency injection.
- **Coverage**: Aim for high coverage on core utility logic and API handlers.

---

## Security Rules

- **Default Authentication**: All routes are protected by default via `src/middleware.ts`.
- **WebSocket Security**: Connections **must** be authenticated using the session cookie.
- **Manual Verification**: Proactively verify session existence (`getSession()`) in sensitive API handlers.
- **Input Validation**: Always validate user input with Zod before processing.

---

## Architecture Decisions

- **Single SSE connection**: `MetricsProvider` creates one `EventSource`. Never create instances in widgets.
- **CSS variable theming**: All colors flow through variables defined in `src/app/globals.css`.
- **Error boundaries**: `ModuleWidgetRegistry` wraps each widget automatically. 
- **Structured logging**: Use `createLogger()` from `src/lib/logger.ts`. Never use `console.log`.

---

## Environment Variables

Required at runtime (set in `.env.local` or `/etc/servermon/env`):

| Variable     | Required | Description                        |
| ------------ | -------- | ---------------------------------- |
| `MONGO_URI`  | Yes      | MongoDB connection string          |
| `JWT_SECRET` | Yes      | Secret for signing session JWTs    |
| `PORT`       | No       | App port (default: 8912)           |
| `NODE_ENV`   | No       | `development` or `production`      |
| `LOG_LEVEL`  | No       | `debug`, `info`, `warn`, `error`   |

---

## Commit Standards

- Run `pnpm check` before committing.
- Write imperative commit messages: "Add health endpoint" not "Added health endpoint".
- Group related changes in one commit.
