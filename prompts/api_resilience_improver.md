# API Resilience Improver Prompt

## Objective

Pick one API endpoint integration or client-side fetching logic and harden it to gracefully handle network failures, timeouts, and unexpected data payloads.

## Philosophy

Robust applications expect the network to fail. Silent drops, infinite loading states, or unhandled promise rejections are unacceptable. Building resilience locally ensures the application remains usable under real-world conditions.

## Workflow

### 1. Pick a Target

- Select a random file in `src/models/`, `src/services/` or `src/modules/*/api/` that makes external requests.

### 2. Audit (Pick 1–3 Issues)

Check for these common fragility gaps:
- **Missing Timeouts**: API calls that could hang indefinitely.
- **Uncaught Errors**: Missing `catch` blocks or missing UI error state propagation.
- **Missing Retry Logic**: Idempotent network calls failing on temporary 5xx errors instead of retrying.
- **Payload Validation**: Assuming JSON payloads will always match expected formats perfectly.

### 3. Fix (Small Scope)

- Fix **1–3 resilience issues** per run.
- Add try/catch blocks, explicit timeout configuration, or basic retry wrappers.

### 4. No-Op Conditions

- If the selected API integration is already highly resilient with timeouts, catches, and retries, log "network layer looks solid" and stop.
- If fixing an issue requires a massive architectural rewrite of how data is fetched globally, log it to `issues_to_look/`.

### 5. Verify

- Run `pnpm check` to ensure no TypeScript regressions.

### 6. Commit

- Commit with a message like: `fix(api): add request timeouts to custom endpoint sync`

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
