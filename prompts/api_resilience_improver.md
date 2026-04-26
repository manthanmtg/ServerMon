# API Resilience Improver Prompt

## Objective

Pick one API endpoint integration or client-side fetching logic and harden it to gracefully handle network failures, timeouts, and unexpected data payloads.

## Philosophy

Robust applications expect the network to fail. Silent drops, infinite loading states, or unhandled promise rejections are unacceptable. Building resilience locally ensures the application remains usable under real-world conditions.

## Workflow

### 1. Pick a Target

- Select one API route, service helper, or client-side fetch path that performs network, database, filesystem, or process-bound work.
- Prefer code with user-visible loading states, retries, or operational side effects over passive model definitions.

### 2. Audit (Pick 1–3 Issues)

Check for these common fragility gaps:

- **Missing Timeouts**: API calls that could hang indefinitely.
- **Uncaught Errors**: Missing `catch` blocks or missing UI error state propagation.
- **Missing Retry Logic**: Idempotent network calls failing on temporary 5xx errors instead of retrying.
- **Payload Validation**: Assuming JSON payloads will always match expected formats perfectly.
- **Ambiguous User Feedback**: Failures that leave the UI stuck loading or return vague server errors.

### 3. Fix (Small Scope)

- Fix **1–3 resilience issues** per run.
- Add try/catch blocks, explicit timeout configuration, or basic retry wrappers.
- Do not retry non-idempotent mutations unless the operation already has a safe idempotency key or equivalent guard.

### 4. No-Op Conditions

- If the selected API integration is already highly resilient with timeouts, catches, and retries, log "network layer looks solid" and stop.
- If fixing an issue requires a massive architectural rewrite of how data is fetched globally, log it to `issues_to_look/`.

### 5. Verify

- Run focused tests when the changed path already has coverage, then run `pnpm check` to ensure no regressions.

### 6. Commit

- Commit with a message like: `fix(api): add request timeouts to custom endpoint sync`

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
