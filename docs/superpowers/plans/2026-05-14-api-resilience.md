# Harden API Calls for Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve API resilience by replacing standard `fetch` with `resilientFetch` in key UI components, adding timeouts and retries.

**Architecture:**
- Use `resilientFetch` from `src/lib/fetch-utils.ts` to handle timeouts and retries automatically.
- Use `safeJson` to handle malformed JSON responses gracefully.
- Apply these changes to `ServerMonUptimeCard.tsx` and `fleet/onboarding/page.tsx`.

**Tech Stack:** React, TypeScript, Fetch API.

---

### Task 1: Harden ServerMonUptimeCard

**Files:**
- Modify: `src/components/settings/ServerMonUptimeCard.tsx`

- [ ] **Step 1: Replace fetch with resilientFetch**

Update `src/components/settings/ServerMonUptimeCard.tsx` to use `resilientFetch` and `safeJson`.

```typescript
<<<<
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
====
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { resilientFetch, safeJson } from '@/lib/fetch-utils';
>>>>
```

```typescript
<<<<
    async function loadRuntime() {
      try {
        const response = await fetch('/api/health');
        const payload = parseHealthResponse(await response.json().catch(() => null));
        if (!active) return;
====
    async function loadRuntime() {
      try {
        const response = await resilientFetch('/api/health', { timeout: 5000, retries: 1 });
        const payload = parseHealthResponse(await safeJson<HealthResponse>(response));
        if (!active) return;
>>>>
```

- [ ] **Step 2: Verify with lint/typecheck**

Run: `pnpm exec tsc --noEmit src/components/settings/ServerMonUptimeCard.tsx`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/ServerMonUptimeCard.tsx
git commit -m "fix(api): use resilientFetch with timeout for uptime card"
```

### Task 2: Harden Fleet Onboarding Page

**Files:**
- Modify: `src/app/fleet/onboarding/page.tsx`

- [ ] **Step 1: Replace fetch with resilientFetch**

Update `src/app/fleet/onboarding/page.tsx` to use `resilientFetch` and `safeJson`.

```typescript
<<<<
import ProShell from '@/components/layout/ProShell';
import { OnboardingWizard } from '@/modules/fleet/ui/onboarding/OnboardingWizard';
====
import ProShell from '@/components/layout/ProShell';
import { OnboardingWizard } from '@/modules/fleet/ui/onboarding/OnboardingWizard';
import { resilientFetch, safeJson } from '@/lib/fetch-utils';
>>>>
```

```typescript
<<<<
    async function load() {
      try {
        const res = await fetch('/api/fleet/server');
        if (res.ok) {
          const data = await res.json();
          // Use the public URL if set, otherwise fallback to current host
====
    async function load() {
      try {
        const res = await resilientFetch('/api/fleet/server', { timeout: 8000, retries: 1 });
        if (res.ok) {
          const data = await safeJson<any>(res);
          if (!data) throw new Error('Failed to parse hub config');
          // Use the public URL if set, otherwise fallback to current host
>>>>
```

- [ ] **Step 2: Verify with lint/typecheck**

Run: `pnpm exec tsc --noEmit src/app/fleet/onboarding/page.tsx`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/app/fleet/onboarding/page.tsx
git commit -m "fix(api): use resilientFetch for fleet onboarding hub discovery"
```
