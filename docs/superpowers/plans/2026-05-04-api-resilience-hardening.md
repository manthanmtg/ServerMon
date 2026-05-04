# API Resilience Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden API interactions by introducing a resilient fetch utility with timeouts and retries, and applying it to critical fleet management pages.

**Architecture:** Create a shared `src/lib/fetch-utils.ts` with `resilientFetch`, `isAbortError`, and `safeJson`. Update frontend components to use these instead of raw `fetch`.

**Tech Stack:** TypeScript, Next.js (App Router), AbortController.

---

### Task 1: Create Resilient Fetch Utility

**Files:**
- Create: `src/lib/fetch-utils.ts`
- Test: `src/lib/fetch-utils.test.ts`

- [ ] **Step 1: Write the utility implementation**

```typescript
export interface ResilientFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException ||
    (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError'))
  );
}

export async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function resilientFetch(
  url: string | URL | Request,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const { timeout = 10000, retries = 0, retryDelay = 1000, ...fetchOptions } = options;

  let lastError: any = null;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      
      if (isAbortError(err)) {
        lastError = new Error(`Request timed out after ${timeout}ms`);
      }

      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
    }
  }
  throw lastError;
}
```

- [ ] **Step 2: Write tests for the utility**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resilientFetch, isAbortError } from './fetch-utils';

describe('resilientFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('successfully fetches data', async () => {
    (fetch as any).mockResolvedValueOnce(new Response('ok'));
    const res = await resilientFetch('/api/test');
    expect(res.ok).toBe(true);
  });

  it('times out if request takes too long', async () => {
    (fetch as any).mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 100)));
    await expect(resilientFetch('/api/test', { timeout: 10 })).rejects.toThrow(/timed out/);
  });

  it('retries on failure', async () => {
    (fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response('ok'));
    
    const res = await resilientFetch('/api/test', { retries: 1, retryDelay: 10 });
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm vitest src/lib/fetch-utils.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/fetch-utils.ts src/lib/fetch-utils.test.ts
git commit -m "feat(api): add resilientFetch utility with timeout and retry support"
```

### Task 2: Harden Fleet Dashboard Fetching

**Files:**
- Modify: `src/app/fleet/page.tsx`

- [ ] **Step 1: Update fetch calls to use resilientFetch**

```typescript
import { resilientFetch } from '@/lib/fetch-utils';

// inside checkSetup
const res = await resilientFetch('/api/fleet/server', { timeout: 5000 });
```

- [ ] **Step 2: Verify lint and typecheck**

Run: `pnpm check`

- [ ] **Step 3: Commit**

```bash
git add src/app/fleet/page.tsx
git commit -m "fix(fleet): harden setup check with timeout"
```

### Task 3: Harden Node Detail Fetching

**Files:**
- Modify: `src/app/fleet/[slug]/page.tsx`

- [ ] **Step 1: Update fetch calls to use resilientFetch**

```typescript
import { resilientFetch } from '@/lib/fetch-utils';

// inside load
const res = await resilientFetch(`/api/fleet/nodes/by-slug/${encodeURIComponent(slug)}`, {
  timeout: 8000,
  retries: 2
});
```

- [ ] **Step 2: Verify lint and typecheck**

Run: `pnpm check`

- [ ] **Step 3: Commit**

```bash
git add src/app/fleet/[slug]/page.tsx
git commit -m "fix(fleet): harden node detail fetching with timeout and retries"
```
