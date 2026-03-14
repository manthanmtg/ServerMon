# CLAUDE.md — Agent Instructions for ServerMon

This file provides instructions for AI agents (Claude, Cursor, Copilot, etc.) working on this codebase.

## Project Overview

ServerMon is a self-hosted server monitoring platform built with Next.js 16 (App Router), TypeScript, MongoDB, and Tailwind CSS 4. It follows a modular architecture where features (terminal, processes, logs, metrics) are independent modules that register into a core shell.

## Mandatory Checks

Before considering any change complete, **all** of these must pass:

```bash
pnpm lint        # ESLint — zero errors, zero warnings
pnpm typecheck   # TypeScript — zero errors
pnpm build       # Next.js production build — must succeed
pnpm test        # Tests — must pass (when tests exist)
```

Shortcut: `pnpm check` runs lint + typecheck + build in sequence.

**Never** submit code that introduces lint warnings, type errors, or build failures. If a pre-existing issue blocks your work, fix it as part of the same change.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # Server-side API endpoints
│   │   ├── auth/           # Login, verify, logout
│   │   ├── health/         # Health check endpoint
│   │   ├── metrics/        # SSE metrics stream
│   │   ├── modules/        # Module data APIs
│   │   ├── analytics/      # Audit log queries
│   │   └── setup/          # First-time setup
│   ├── dashboard/          # Dashboard page
│   ├── terminal/           # Terminal page
│   ├── processes/          # Process list page
│   ├── logs/               # Audit logs page
│   ├── settings/           # Settings page
│   ├── login/              # Login page
│   ├── setup/              # Setup wizard
│   ├── layout.tsx          # Root layout (fonts, ThemeProvider, ToastProvider)
│   ├── page.tsx            # Root redirect (→ setup, login, or dashboard)
│   └── globals.css         # Tailwind v4 @theme, CSS variable definitions
├── components/
│   ├── ui/                 # Reusable primitives (Button, Input, Card, Badge, etc.)
│   ├── layout/             # ProShell (sidebar + header shell)
│   └── modules/            # ModuleWidgetRegistry
├── lib/                    # Shared utilities and providers
│   ├── ThemeContext.tsx     # Theme provider + useTheme hook
│   ├── MetricsContext.tsx   # SSE metrics provider + useMetrics hook
│   ├── logger.ts           # Structured logger (createLogger)
│   ├── utils.ts            # cn() class merge utility
│   ├── db.ts               # MongoDB connection (singleton)
│   ├── session.ts          # JWT session management
│   ├── metrics.ts          # MetricsService (system info polling)
│   ├── analytics.ts        # Analytics event tracking
│   ├── themes.ts           # Theme definitions (colors, types)
│   └── modules/            # Module system (registry, loader, event bus)
├── modules/                # Feature modules
│   ├── health/             # System health widget
│   ├── metrics/            # CPU + memory chart widgets
│   ├── terminal/           # Web terminal (xterm.js)
│   ├── processes/          # Process list
│   └── logs/               # Audit log widgets + page
├── models/                 # Mongoose models (User, AnalyticsEvent)
└── types/                  # Shared TypeScript types (Module interface)
```

## Code Conventions

### TypeScript

- Strict mode is enabled. Never use `any` — use `unknown` and narrow.
- Prefer `interface` over `type` for object shapes.
- Use Zod schemas as the source of truth for validation; derive TS types with `z.infer`.
- Prefix unused parameters with `_` (configured in ESLint).

### React / Next.js

- Use App Router conventions. Pages are in `src/app/<route>/page.tsx`.
- Client components must have `'use client'` at the top.
- API routes are in `src/app/api/<path>/route.ts` and export `GET`, `POST`, etc.
- Use `export const dynamic = 'force-dynamic'` for routes that access databases or runtime state.
- Server components are the default. Only add `'use client'` when you need hooks, event handlers, or browser APIs.

### Styling

- **Use Tailwind classes exclusively.** No inline styles, no CSS modules, no styled-components.
- **Use semantic color classes** that map to CSS variables: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `bg-secondary`, `text-destructive`, `bg-success`, `text-warning`, etc.
- **Never hardcode colors** like `bg-slate-900`, `text-indigo-400`, `#6366f1`. All colors must come from the theme system so theme switching works.
- The theme token mapping is defined in `src/app/globals.css` under `@theme inline`.
- Available tokens: `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `success`, `warning`, `sidebar`, `sidebar-foreground`, `sidebar-border`.

### UI Components

- Use the shared primitives from `src/components/ui/` — `Button`, `Input`, `Card`, `Badge`, `Spinner`, `Skeleton`.
- Use `WidgetErrorBoundary` around any widget that could throw.
- Use `useToast()` for user-facing feedback messages.
- Use `cn()` from `src/lib/utils.ts` for conditional class merging.
- All interactive elements must have a minimum touch target of 44px (`min-h-[44px]`).
- Use `dvh` instead of `vh` for viewport height on mobile-facing layouts.

### Logging

- Use `createLogger('context-name')` from `src/lib/logger.ts`.
- Never use bare `console.log` / `console.error` in API routes or services.
- Log levels: `debug` (development), `info` (normal events), `warn` (recoverable), `error` (failures).
- Include relevant data as the second argument: `log.error('Failed to fetch', error)`.

### API Routes

- Always wrap handler bodies in try/catch.
- Return structured JSON errors: `{ error: "Human-readable message" }` with proper HTTP status codes.
- Cap unbounded queries (e.g., `Math.min(limit, 500)`).
- Use the logger, not console.

### Modules

Each module lives in `src/modules/<name>/` and follows this structure:

```
modules/<name>/
├── module.ts              # Module registration (id, name, widgets, lifecycle)
├── ui/
│   ├── <Name>Widget.tsx   # Dashboard widget component
│   └── <Name>Page.tsx     # Full page component (optional)
└── api/                   # Module-specific API routes (optional)
```

Widgets must be registered in `src/components/modules/ModuleWidgetRegistry.tsx` with a `WidgetErrorBoundary` wrapper.

New module pages need a route in `src/app/<name>/page.tsx` that wraps content in `<ProShell>`.

New modules need a nav entry in `src/components/layout/ProShell.tsx` in the `navGroups` array.

## Security Rules

- **Default Authentication**: All routes (UI and API) are protected by default via middleware (`src/middleware.ts`). Only an explicit whitelisted set of public routes (e.g., `/login`, `/api/auth/login`) are unauthenticated.
- **WebSocket Security**: All Socket.io connections **must** be authenticated using the session cookie. Use the authentication middleware in `src/server.ts`.
- **API Hardening**: Critical API routes (settings, system updates, user management) **must** double-check the session using `getSession()` and enforce role-based access control where appropriate.
- **Manual Verification**: Never trust that middleware alone covers all cases. Proactively verify session existence in sensitive API handlers.
- **Secrets Management**: JWT secrets come from environment variables. Never hardcode secrets or provide insecure fallbacks in production.
- **Input Validation**: Validate all user input with Zod before processing.

## Mobile / Responsive Requirements

- All layouts must work on 320px–1440px+ viewports.
- Tables must have a card-based mobile layout (`sm:hidden` / `hidden sm:block` pattern).
- Use `min-h-[44px]` for all interactive elements (Apple HIG touch target).
- Use `env(safe-area-inset-bottom)` for bottom-anchored elements.
- Use `100dvh` not `100vh` for full-height layouts.
- Test responsive breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).

## Common Pitfalls

- **Don't create duplicate SSE connections.** Use `MetricsProvider` + `useMetrics()` hook. Never create `new EventSource` in widget components directly.
- **Don't skip error boundaries.** All widgets rendered via `ModuleWidgetRegistry` are wrapped automatically. If you render a widget outside the registry, wrap it in `<WidgetErrorBoundary>`.
- **Don't use `import { connectDB }` (named).** It's a default export: `import connectDB from '@/lib/db'`.
- **Don't use `vh` units.** Use `dvh` for dynamic viewport height.
- **Don't forget `export const dynamic = 'force-dynamic'`** on API routes or server pages that access the database.

## Commit Standards

- Run `pnpm check` before committing.
- Write imperative commit messages: "Add health endpoint" not "Added health endpoint".
- First line ≤ 72 characters. Add detail in the body if needed.
- Group related changes in one commit. Don't mix unrelated fixes.
