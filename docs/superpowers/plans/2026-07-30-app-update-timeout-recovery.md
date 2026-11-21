# App Update Timeout Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent managed Git app updates from staying `running` forever by adding a one-hour deadline, live cancellation, and stale operation recovery.

**Architecture:** Persist `deadlineAt` on update operations, reconcile expired operations before startup scans and update lock acquisition, and use compare-and-set terminal writes so timed-out records cannot be overwritten by late completions. Thread an operation `AbortSignal` through Git and deployment helpers so live commands and waits stop at the deadline while deploy rollback still runs without the aborted signal.

**Tech Stack:** Next.js 16.1 App Router, TypeScript, Mongoose, Vitest, Node child process APIs, `AbortController`.

---

## File Structure

| File                                    | Action | Responsibility                                                                                                                            |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/apps/types.ts`             | Modify | Expose optional operation `deadlineAt` in the UI/API DTO contract.                                                                        |
| `src/models/ManagedApp.ts`              | Modify | Persist optional `deadlineAt` on operation subdocuments.                                                                                  |
| `src/lib/apps/deploy.ts`                | Modify | Add abort-aware command execution, deploy waits, health checks, and certbot retry waits.                                                  |
| `src/lib/apps/git.ts`                   | Modify | Accept and pass abort signals to every Git command.                                                                                       |
| `src/lib/apps/service.ts`               | Modify | Add timeout constants, operation deadlines, stale reconciliation, atomic terminal updates, and timeout handling in `updateManagedGitApp`. |
| `src/lib/apps/auto-update.ts`           | Modify | Reconcile stale update operations before due-app discovery.                                                                               |
| `src/server.ts`                         | Modify | Reconcile stale update operations before starting the Git auto-update scheduler.                                                          |
| `src/lib/apps/service.update.test.ts`   | Modify | Cover deadline creation, stale recovery, lock recovery, live timeout, and late terminal protection.                                       |
| `src/lib/apps/deploy.test.ts`           | Modify | Cover abort propagation and rollback execution after cancellation.                                                                        |
| `src/lib/apps/git.test.ts`              | Modify | Cover signal propagation through Git commands.                                                                                            |
| `src/lib/apps/auto-update.test.ts`      | Modify | Cover stale reconciliation before scheduled scan.                                                                                         |
| `src/modules/apps/ui/AppsPage.test.tsx` | Modify | Cover update button enabled when API returns failed timeout operation.                                                                    |

## Task 1: Persist And Serialize Operation Deadlines

**Files:**

- Modify: `src/modules/apps/types.ts`
- Modify: `src/models/ManagedApp.ts`
- Modify: `src/lib/apps/service.ts`
- Test: `src/lib/apps/service.test.ts`

- [ ] **Step 1: Write the failing DTO/schema test**

Add `deadlineAt` to the existing operation fixture in `src/lib/apps/service.test.ts` and assert it is serialized:

```ts
deadlineAt: new Date('2026-05-06T13:00:00.000Z'),
```

Expected assertion:

```ts
expect(dto.operations[0]).toMatchObject({
  id: 'deploy-1',
  deadlineAt: '2026-05-06T13:00:00.000Z',
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm vitest run src/lib/apps/service.test.ts
```

Expected: fails because operation DTOs do not include `deadlineAt`.

- [ ] **Step 3: Add the optional type/schema field**

In `src/modules/apps/types.ts`, extend `AppOperation`:

```ts
deadlineAt?: string;
```

In `src/models/ManagedApp.ts`, extend the operation document type and schema:

```ts
deadlineAt?: Date;
```

```ts
deadlineAt: { type: Date },
```

In `src/lib/apps/service.ts`, add `deadlineAt?: Date | string` to `ManagedAppDTORecord.operations` and map it:

```ts
deadlineAt: toIsoDate(operation.deadlineAt),
```

- [ ] **Step 4: Run the test to verify GREEN**

Run:

```bash
pnpm vitest run src/lib/apps/service.test.ts
```

Expected: passes.

## Task 2: Add Stale Operation Reconciliation

**Files:**

- Modify: `src/lib/apps/service.ts`
- Test: `src/lib/apps/service.update.test.ts`

- [ ] **Step 1: Write failing reconciliation tests**

Mock `ManagedApp.updateMany` and add tests importing `APP_UPDATE_TIMEOUT_MS` and `reconcileStaleAppUpdateOperations`:

```ts
it('marks expired running update operations as failed', async () => {
  mockUpdateMany.mockResolvedValue({ modifiedCount: 2 });

  const now = new Date('2026-05-07T01:00:00.000Z');
  const result = await reconcileStaleAppUpdateOperations({ now });

  expect(result).toEqual({ matched: 2, modified: 2 });
  expect(mockUpdateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      operations: {
        $elemMatch: expect.objectContaining({
          type: 'update',
          status: 'running',
        }),
      },
    }),
    expect.any(Array)
  );
});
```

Also add a lock recovery test:

```ts
it('reconciles stale update locks before rejecting duplicate updates', async () => {
  mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mockFindOneAndUpdate.mockResolvedValue(app);
  mockPrepareGitSourceForDeploy.mockResolvedValue({
    sourcePath: '/srv/servermon/apps/git-portal/repository',
    previousSha: 'old-sha',
    remoteSha: 'old-sha',
    currentSha: 'old-sha',
    changed: false,
    cloned: false,
    logs: ['$ git fetch origin main'],
  });

  await updateManagedGitApp('app-1');

  expect(mockUpdateMany).toHaveBeenCalled();
  expect(mockFindOneAndUpdate).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm vitest run src/lib/apps/service.update.test.ts
```

Expected: fails because `reconcileStaleAppUpdateOperations` and `ManagedApp.updateMany` mock wiring do not exist.

- [ ] **Step 3: Implement reconciliation**

In `src/lib/apps/service.ts`, add constants:

```ts
export const APP_UPDATE_TIMEOUT_MS = 60 * 60_000;
export const APP_UPDATE_TIMEOUT_ERROR = 'Update timed out after 1 hour';
const APP_UPDATE_TIMEOUT_STEP = 'Update timed out';
```

Add:

```ts
export async function reconcileStaleAppUpdateOperations({
  now = new Date(),
  appId,
}: { now?: Date; appId?: string } = {}): Promise<{ matched: number; modified: number }> {
  await connectDB();
  const staleStartedBefore = new Date(now.getTime() - APP_UPDATE_TIMEOUT_MS);
  const timeoutLog = `${APP_UPDATE_TIMEOUT_ERROR}. Marked failed by ServerMon recovery at ${now.toISOString()}.`;
  const query = {
    ...(appId ? { _id: appId } : {}),
    operations: {
      $elemMatch: {
        type: 'update',
        status: 'running',
        $or: [
          { deadlineAt: { $lte: now } },
          { deadlineAt: { $exists: false }, startedAt: { $lte: staleStartedBefore } },
        ],
      },
    },
  };
  const result = await ManagedApp.updateMany(query, [
    {
      $set: {
        operations: {
          $map: {
            input: '$operations',
            as: 'operation',
            in: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$$operation.type', 'update'] },
                    { $eq: ['$$operation.status', 'running'] },
                    {
                      $or: [
                        { $lte: ['$$operation.deadlineAt', now] },
                        {
                          $and: [
                            { $eq: [{ $type: '$$operation.deadlineAt' }, 'missing'] },
                            { $lte: ['$$operation.startedAt', staleStartedBefore] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  $mergeObjects: [
                    '$$operation',
                    {
                      status: 'failed',
                      step: APP_UPDATE_TIMEOUT_STEP,
                      completedAt: now,
                      error: APP_UPDATE_TIMEOUT_ERROR,
                      logs: {
                        $slice: [
                          { $concatArrays: [{ $ifNull: ['$$operation.logs', []] }, [timeoutLog]] },
                          -MAX_OPERATION_LOGS,
                        ],
                      },
                    },
                  ],
                },
                '$$operation',
              ],
            },
          },
        },
      },
    },
  ]);
  return {
    matched: result.matchedCount ?? result.modifiedCount ?? 0,
    modified: result.modifiedCount ?? 0,
  };
}
```

Call this at the start of `startExclusiveUpdateOperation(appId, ...)` before `findOneAndUpdate`.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm vitest run src/lib/apps/service.update.test.ts
```

Expected: passes.

## Task 3: Make Update Terminal Writes Atomic

**Files:**

- Modify: `src/lib/apps/service.ts`
- Test: `src/lib/apps/service.update.test.ts`

- [ ] **Step 1: Write failing late-completion test**

Add a test that makes `ManagedApp.updateOne` return `{ modifiedCount: 0 }` for the operation terminal update and verifies a timeout failure is not overwritten:

```ts
it('does not overwrite an update timeout with a late success completion', async () => {
  mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
  mockFindOneAndUpdate.mockResolvedValue(app);
  mockPrepareGitSourceForDeploy.mockResolvedValue({
    sourcePath: '/srv/servermon/apps/git-portal/repository',
    previousSha: 'old-sha',
    remoteSha: 'old-sha',
    currentSha: 'old-sha',
    changed: false,
    cloned: false,
    logs: ['$ git fetch origin main'],
  });

  await updateManagedGitApp('app-1');

  expect(mockUpdateOne).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: 'app-1',
      operations: { $elemMatch: { id: expect.any(String), status: 'running' } },
    }),
    expect.any(Object)
  );
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm vitest run src/lib/apps/service.update.test.ts
```

Expected: fails because `completeAppOperation` mutates the in-memory document and saves.

- [ ] **Step 3: Add compare-and-set helper**

Replace `completeAppOperation` for update operations with an atomic helper:

```ts
async function completeRunningAppOperation(
  app: IManagedApp,
  operationId: string,
  input: {
    status: AppOperationStatus;
    step: string;
    logs?: string[];
    error?: string;
    releaseId?: string;
    commitSha?: string;
    completedAt?: Date;
  }
): Promise<boolean> {
  const completedAt = input.completedAt ?? new Date();
  const operation = app.operations?.find((item) => item.id === operationId);
  if (operation && operation.status === 'running') {
    operation.status = input.status;
    operation.step = input.step;
    operation.completedAt = completedAt;
    operation.error = input.error;
    operation.releaseId = input.releaseId ?? operation.releaseId;
    operation.commitSha = input.commitSha ?? operation.commitSha;
    operation.logs = input.logs ? input.logs.slice(-MAX_OPERATION_LOGS) : operation.logs;
  }

  const result = await ManagedApp.updateOne(
    {
      _id: app._id,
      operations: { $elemMatch: { id: operationId, status: 'running' } },
    },
    {
      $set: {
        'operations.$.status': input.status,
        'operations.$.step': input.step,
        'operations.$.completedAt': completedAt,
        'operations.$.error': input.error,
        ...(input.releaseId ? { 'operations.$.releaseId': input.releaseId } : {}),
        ...(input.commitSha ? { 'operations.$.commitSha': input.commitSha } : {}),
        ...(input.logs ? { 'operations.$.logs': input.logs.slice(-MAX_OPERATION_LOGS) } : {}),
      },
    }
  );
  return result.modifiedCount === 1;
}
```

Use this helper for update operations, and guard later app-level saves by reloading the current operation if the terminal CAS loses.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm vitest run src/lib/apps/service.update.test.ts
```

Expected: passes.

## Task 4: Add Live Timeout And Abort Propagation

**Files:**

- Modify: `src/lib/apps/service.ts`
- Modify: `src/lib/apps/deploy.ts`
- Modify: `src/lib/apps/git.ts`
- Test: `src/lib/apps/service.update.test.ts`
- Test: `src/lib/apps/deploy.test.ts`
- Test: `src/lib/apps/git.test.ts`

- [ ] **Step 1: Write failing abort tests**

In `src/lib/apps/deploy.test.ts`, add a test that passes an aborted `AbortController` to `deployNextJsApp` and verifies rollback commands are attempted without the aborted signal:

```ts
it('aborts deployment commands and still runs rollback without the aborted signal', async () => {
  const controller = new AbortController();
  const observedSignals: Array<AbortSignal | undefined> = [];
  const commandRunner = vi.fn(async ({ command, signal }) => {
    observedSignals.push(signal);
    if (command === 'pnpm build') {
      controller.abort(new Error('Update timed out after 1 hour'));
      return { code: 1, output: 'aborted' };
    }
    return { code: 0, output: `${command} ok` };
  });

  const result = await deployNextJsApp({ ...options, signal: controller.signal, commandRunner });

  expect(result.status).toBe('failed');
  expect(result.error).toContain('Update timed out after 1 hour');
  expect(observedSignals.at(-1)).toBeUndefined();
});
```

In `src/lib/apps/git.test.ts`, add:

```ts
it('passes abort signals to git command runner calls', async () => {
  const controller = new AbortController();
  const signals: Array<AbortSignal | undefined> = [];
  await prepareGitSourceForDeploy({
    repoUrl: 'https://github.com/acme/app.git',
    branch: 'main',
    repositoryPath: '/srv/servermon-apps/app/repository',
    updateToRemote: false,
    pathExists: async () => true,
    signal: controller.signal,
    commandRunner: async ({ command, signal }) => {
      signals.push(signal);
      if (command === 'git config --get remote.origin.url')
        return { code: 0, output: 'https://github.com/acme/app.git\n' };
      if (command === 'git rev-parse HEAD') return { code: 0, output: 'abc123\n' };
      return { code: 0, output: 'abc123 refs/heads/main\n' };
    },
  });
  expect(signals.every((signal) => signal === controller.signal)).toBe(true);
});
```

In `src/lib/apps/service.update.test.ts`, use fake timers and a never-resolving Git/deploy promise to verify `updateManagedGitApp` fails with the timeout reason after one hour.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm vitest run src/lib/apps/deploy.test.ts src/lib/apps/git.test.ts src/lib/apps/service.update.test.ts
```

Expected: fails because signals are not accepted or propagated.

- [ ] **Step 3: Implement abort support**

In `CommandRunRequest`, add:

```ts
signal?: AbortSignal;
```

In `DeployNextJsAppOptions`, `GitCommandOptions`, and `PrepareGitSourceOptions`, add optional `signal?: AbortSignal`.

Add `throwIfAborted(signal)` and `sleep(ms, signal)` helpers in `deploy.ts`. Before and after each command or wait, throw the signal reason if aborted.

Update `defaultCommandRunner` to spawn detached process groups, listen for `signal.abort`, terminate `-child.pid` with `SIGTERM`, and escalate to `SIGKILL` after a short grace period. Resolve once on `close` or `error`.

Thread `signal` through:

```ts
runOrThrow(commandRunner, app.commands.install, logs, sourceRoot, onProgress, signal);
runOrThrow(commandRunner, app.commands.build, logs, sourceRoot, onProgress, signal);
waitForHealthy({ ..., signal });
runCertbotOrThrow({ ..., signal });
```

For rollback in the deploy catch block, call:

```ts
commandRunner({ command: `systemctl restart ${serviceName}` });
```

without the aborted signal.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm vitest run src/lib/apps/deploy.test.ts src/lib/apps/git.test.ts src/lib/apps/service.update.test.ts
```

Expected: passes.

## Task 5: Wire Scheduler And Startup Recovery

**Files:**

- Modify: `src/lib/apps/auto-update.ts`
- Modify: `src/server.ts`
- Test: `src/lib/apps/auto-update.test.ts`

- [ ] **Step 1: Write failing scheduler recovery test**

Update the service mock:

```ts
vi.mock('./service', () => ({
  reconcileStaleAppUpdateOperations: mockReconcileStaleAppUpdateOperations,
  updateManagedGitApp: mockUpdateManagedGitApp,
}));
```

Add:

```ts
it('reconciles stale update operations before finding due apps', async () => {
  mockReconcileStaleAppUpdateOperations.mockResolvedValue({ matched: 1, modified: 1 });
  mockFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

  await runDueGitAppAutoUpdates(new Date('2026-05-07T00:00:00.000Z'));

  expect(mockReconcileStaleAppUpdateOperations).toHaveBeenCalledWith({
    now: new Date('2026-05-07T00:00:00.000Z'),
  });
  expect(mockFind.mock.invocationCallOrder[0]).toBeGreaterThan(
    mockReconcileStaleAppUpdateOperations.mock.invocationCallOrder[0]
  );
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm vitest run src/lib/apps/auto-update.test.ts
```

Expected: fails because `runDueGitAppAutoUpdates` does not reconcile first.

- [ ] **Step 3: Implement scheduler/startup wiring**

In `src/lib/apps/auto-update.ts`, import and call:

```ts
await reconcileStaleAppUpdateOperations({ now });
```

before `ManagedApp.find(...)`.

In `src/server.ts`, import `reconcileStaleAppUpdateOperations` and call it before `startGitAppAutoUpdateScheduler()`:

```ts
try {
  const recoveredUpdates = await reconcileStaleAppUpdateOperations();
  if (recoveredUpdates.modified > 0) {
    log.warn('Recovered stale app update operations before scheduler startup', recoveredUpdates);
  }
} catch (error) {
  log.error('Failed to recover stale app update operations before scheduler startup', error);
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm vitest run src/lib/apps/auto-update.test.ts
```

Expected: passes.

## Task 6: UI Regression

**Files:**

- Modify: `src/modules/apps/ui/AppsPage.test.tsx`

- [ ] **Step 1: Add UI regression test**

Add a test with a Git app whose latest update operation is failed:

```ts
operations: [
  {
    id: 'update-timeout',
    type: 'update',
    status: 'failed',
    title: 'Manual update',
    step: 'Update timed out',
    startedAt: '2026-05-07T00:00:00.000Z',
    completedAt: '2026-05-07T01:00:00.000Z',
    deadlineAt: '2026-05-07T01:00:00.000Z',
    error: 'Update timed out after 1 hour',
    logs: ['Update timed out after 1 hour'],
  },
];
```

Assert:

```ts
const updateButton = screen.getByRole('button', { name: /update/i });
expect((updateButton as HTMLButtonElement).disabled).toBe(false);
expect(updateButton.querySelector('.animate-spin')).toBeFalsy();
```

- [ ] **Step 2: Run UI test**

Run:

```bash
pnpm vitest run src/modules/apps/ui/AppsPage.test.tsx
```

Expected: passes once backend DTO includes `deadlineAt`; no UI production change is expected.

## Task 7: Focused Verification And Commit

**Files:**

- Verify all touched files.

- [ ] **Step 1: Run focused Apps tests**

Run:

```bash
pnpm vitest run src/lib/apps/service.test.ts src/lib/apps/service.update.test.ts src/lib/apps/deploy.test.ts src/lib/apps/git.test.ts src/lib/apps/auto-update.test.ts src/lib/apps/auto-update-scheduler.test.ts src/modules/apps/ui/AppsPage.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run required project checks**

Run:

```bash
pnpm format:check
pnpm check:release-contract
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: all checks should pass, or any pre-existing repository-wide failures must be reported with exact command output and scoped away from this change.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff -- src/modules/apps/types.ts src/models/ManagedApp.ts src/lib/apps/deploy.ts src/lib/apps/git.ts src/lib/apps/service.ts src/lib/apps/auto-update.ts src/server.ts src/lib/apps/service.update.test.ts src/lib/apps/deploy.test.ts src/lib/apps/git.test.ts src/lib/apps/auto-update.test.ts src/modules/apps/ui/AppsPage.test.tsx
```

Expected: only timeout recovery, cancellation, reconciliation, and matching tests are present.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/modules/apps/types.ts src/models/ManagedApp.ts src/lib/apps/deploy.ts src/lib/apps/git.ts src/lib/apps/service.ts src/lib/apps/auto-update.ts src/server.ts src/lib/apps/service.test.ts src/lib/apps/service.update.test.ts src/lib/apps/deploy.test.ts src/lib/apps/git.test.ts src/lib/apps/auto-update.test.ts src/modules/apps/ui/AppsPage.test.tsx docs/superpowers/plans/2026-07-30-app-update-timeout-recovery.md
git commit -m "fix: recover stale app update operations"
```

Expected: commit contains the implementation and tests.

## Self-Review

- Spec coverage: The plan covers deadline persistence, legacy stale recovery, live timeout cancellation, atomic terminal writes, scheduler/startup reconciliation, UI behavior, observability, rollback behavior, and verification.
- Placeholder scan: No `TBD`, `TODO`, "implement later", or unspecified "relevant files" steps remain.
- Type consistency: The field is consistently named `deadlineAt`; the timeout constants are `APP_UPDATE_TIMEOUT_MS` and `APP_UPDATE_TIMEOUT_ERROR`; the recovery function is `reconcileStaleAppUpdateOperations`.
