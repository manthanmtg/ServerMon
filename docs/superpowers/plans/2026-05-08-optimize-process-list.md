# Process List Performance Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce unnecessary re-renders in the Process module UI by implementing custom memoization logic for process items.

**Architecture:** Use `React.memo` with a custom comparison function for `ProcessRow` and `ProcessCard` components. The comparison will skip re-renders if visible data hasn't changed, while ensuring that expanded state transitions and updates to visible fields (even slight ones for animation) still trigger renders.

**Tech Stack:** React (TypeScript), Lucide React, Framer Motion

---

### Task 1: Research and Baseline

**Files:**
- Modify: `src/modules/processes/ui/components/ProcessList.tsx`

- [ ] **Step 1: Analyze current memoization**
Read the file to identify exact fields used in `ProcessCard` and `ProcessRow`.

- [ ] **Step 2: Verify existing tests pass**
Run: `pnpm test src/modules/processes/ui/ProcessWidget.test.tsx`
Expected: PASS

### Task 2: Implement Custom Comparison for ProcessCard

**Files:**
- Modify: `src/modules/processes/ui/components/ProcessList.tsx`

- [ ] **Step 1: Define `areProcessPropsEqual` helper (or inline comparison)**

- [ ] **Step 2: Update `ProcessCard` memoization**

```tsx
const ProcessCard = React.memo(
  ({ process: p, isExpanded, isKilling, onToggleExpand, onKill }: ProcessItemProps) => {
    // ... existing implementation
  },
  (prev, next) => {
    if (prev.isExpanded !== next.isExpanded || prev.isKilling !== next.isKilling) return false;
    if (prev.onToggleExpand !== next.onToggleExpand || prev.onKill !== next.onKill) return false;
    
    const p = prev.process;
    const n = next.process;
    
    // Core visible fields in card
    if (p.pid !== n.pid || p.state !== n.state || p.name !== n.name || p.user !== n.user) return false;
    
    // Performance fields (cpu/mem) - we want to re-render for animations even if small changes
    if (p.cpu !== n.cpu || p.mem !== n.mem) return false;
    
    // Uptime (via formatTime)
    if (p.started !== n.started) return false;
    
    // If expanded, check additional fields shown in detail view
    if (next.isExpanded) {
      if (p.command !== n.command || p.memRss !== n.memRss || p.parentPid !== n.parentPid || p.priority !== n.priority) return false;
    }
    
    return true;
  }
);
```

- [ ] **Step 3: Verify tests still pass**
Run: `pnpm test src/modules/processes/ui/ProcessWidget.test.tsx`
Expected: PASS

### Task 3: Implement Custom Comparison for ProcessRow

**Files:**
- Modify: `src/modules/processes/ui/components/ProcessList.tsx`

- [ ] **Step 1: Update `ProcessRow` memoization**

```tsx
const ProcessRow = React.memo(
  ({ process: p, isExpanded, isKilling, onToggleExpand, onKill }: ProcessItemProps) => {
    // ... existing implementation
  },
  (prev, next) => {
    if (prev.isExpanded !== next.isExpanded || prev.isKilling !== next.isKilling) return false;
    if (prev.onToggleExpand !== next.onToggleExpand || prev.onKill !== next.onKill) return false;
    
    const p = prev.process;
    const n = next.process;
    
    // Table columns visible fields
    if (p.pid !== n.pid || p.name !== n.name || p.user !== n.user || p.state !== n.state) return false;
    if (p.cpu !== n.cpu || p.mem !== n.mem || p.started !== n.started) return false;
    
    // Expanded detail fields
    if (next.isExpanded) {
      if (p.command !== n.command || p.path !== n.path || p.memRss !== n.memRss || 
          p.parentPid !== n.parentPid || p.priority !== n.priority) return false;
    }
    
    return true;
  }
);
```

- [ ] **Step 2: Verify tests still pass**
Run: `pnpm test src/modules/processes/ui/ProcessWidget.test.tsx`
Expected: PASS

### Task 4: Final Verification and Cleanup

**Files:**
- Modify: `prompts/prompts_metadata.json`

- [ ] **Step 1: Run full verification**
Run: `pnpm check` (or at least `pnpm lint` and `pnpm test`)

- [ ] **Step 2: Update metadata**
Set `lastOutcome` to `completed` and update counters in `prompts/prompts_metadata.json`.

- [ ] **Step 3: Commit all changes**
```bash
git add src/modules/processes/ui/components/ProcessList.tsx prompts/prompts_metadata.json
git commit -m "perf(processes): optimize process item re-renders with custom memoization"
```
