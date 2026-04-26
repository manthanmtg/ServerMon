# ServerMon Uptime Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live ticking ServerMon process uptime card above the ServerMon Services card in Settings.

**Architecture:** The card is a focused client component that reads `GET /api/health` once, stores the returned uptime and local receipt timestamp, and advances the displayed uptime once per second. The settings page only imports and places the component.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Testing Library, Tailwind theme tokens, lucide-react.

---

## File Structure

- Create `src/components/settings/ServerMonUptimeCard.tsx`
  - Owns health fetch, local ticker state, uptime formatting, and card rendering.
- Create `src/components/settings/ServerMonUptimeCard.test.tsx`
  - Verifies fetched uptime rendering, local ticking, formatter output, degraded health, and failed fetch behavior.
- Modify `src/app/settings/page.tsx`
  - Imports `ServerMonUptimeCard` and renders it immediately above `ServerMonServicesCard`.

## Task 1: Uptime Card Tests

**Files:**

- Create: `src/components/settings/ServerMonUptimeCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServerMonUptimeCard, { formatServerMonUptime } from './ServerMonUptimeCard';

describe('formatServerMonUptime', () => {
  it.each([
    [5, '5s'],
    [185, '3m 5s'],
    [7385, '2h 3m 5s'],
    [97385, '1d 3h 3m 5s'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatServerMonUptime(seconds)).toBe(expected);
  });
});

describe('ServerMonUptimeCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T15:00:00.000Z'));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', uptime: 97385 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders fetched uptime and online status', async () => {
    render(<ServerMonUptimeCard />);

    expect(screen.getByText('ServerMon Uptime')).toBeDefined();
    await waitFor(() => expect(screen.getByText('1d 3h 3m 5s')).toBeDefined());
    expect(screen.getByText('Online')).toBeDefined();
    expect(screen.getByText('Resets when ServerMon restarts')).toBeDefined();
  });

  it('advances the ticker locally without another fetch', async () => {
    render(<ServerMonUptimeCard />);

    await waitFor(() => expect(screen.getByText('1d 3h 3m 5s')).toBeDefined());

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText('1d 3h 3m 10s')).toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('shows degraded when health status is not ok but uptime is valid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'degraded', uptime: 185 }),
    });

    render(<ServerMonUptimeCard />);

    await waitFor(() => expect(screen.getByText('3m 5s')).toBeDefined());
    expect(screen.getByText('Degraded')).toBeDefined();
  });

  it('shows unavailable when uptime cannot be loaded', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    render(<ServerMonUptimeCard />);

    await waitFor(() => expect(screen.getByText('Unavailable')).toBeDefined());
    expect(screen.getByText('Uptime could not be loaded')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/settings/ServerMonUptimeCard.test.tsx`

Expected: FAIL because `ServerMonUptimeCard` does not exist.

## Task 2: Uptime Card Component

**Files:**

- Create: `src/components/settings/ServerMonUptimeCard.tsx`

- [ ] **Step 1: Implement the component**

Create a client component that:

- Fetches `/api/health` on mount.
- Accepts valid numeric `uptime` even from non-OK HTTP responses.
- Stores the local receipt timestamp with `Date.now()`.
- Uses a one-second interval to update a local `nowMs`.
- Renders loading, online, degraded, and unavailable states with stable card layout.
- Exports `formatServerMonUptime` for unit tests.

- [ ] **Step 2: Run component tests**

Run: `pnpm vitest run src/components/settings/ServerMonUptimeCard.test.tsx`

Expected: PASS.

## Task 3: Settings Page Placement

**Files:**

- Modify: `src/app/settings/page.tsx`
- Test: `src/app/settings/page.test.tsx`

- [ ] **Step 1: Place the component**

Import `ServerMonUptimeCard` from `@/components/settings/ServerMonUptimeCard` and render it in the right settings column immediately before `ServerMonServicesCard`.

- [ ] **Step 2: Add or update a settings page assertion if needed**

If settings page tests need an explicit assertion, verify that `ServerMon Uptime` appears before service controls.

- [ ] **Step 3: Run focused tests**

Run: `pnpm vitest run src/components/settings/ServerMonUptimeCard.test.tsx src/app/settings/page.test.tsx`

Expected: PASS.

## Task 4: Verification and Publish

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run project checks**

Run: `pnpm check`

Expected: lint, typecheck, build, and tests all pass.

- [ ] **Step 2: Review git diff**

Run: `git diff --stat && git diff --check`

Expected: no whitespace errors and only intended files changed.

- [ ] **Step 3: Commit and push main**

Run:

```bash
git add docs/superpowers/plans/2026-04-26-servermon-uptime-card.md src/components/settings/ServerMonUptimeCard.tsx src/components/settings/ServerMonUptimeCard.test.tsx src/app/settings/page.tsx
git commit -m "Add ServerMon uptime card"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.
