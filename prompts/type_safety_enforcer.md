# Type Safety Enforcer Prompt

## Objective

Pick a single module or file and eradicate weak typing, implicit `any` usage, and dangerous `@ts-ignore` assertions to enforce strict compile-time safety.

## Philosophy

TypeScript's value is proportional to the strictness of its boundaries. Resorting to `any` or bypassing the compiler is borrowing from future stability to pay for present convenience.

## Workflow

### 1. Pick a Target

- Pick a random file across the codebase containing `any`, `// @ts-ignore`, `// @ts-expect-error`, or `as unknown as Type`.

### 2. Audit

Check for these gaps:

- **Implicit boundaries**: API responses assigned to `any`.
- **Loose Objects**: `Record<string, any>` instead of proper interfaces.
- **Suppressed Compiler Errors**: Legacy `@ts-ignore` comments masking real bugs.

### 3. Fix (Small Scope)

- Replace 1-3 weak boundaries with strongly typed interfaces, discriminated unions, or validation schemas (Zod).
- Resolve underlying logic flaws preventing strict typing.

### 4. No-Op Conditions

- If the selected file is already strictly typed, pick another. If 3 files are clean, log "type safety looks robust" and stop.
- If correctly typing involves updating an external dependency mismatch or requires an overhaul of the entire store, log it to `issues_to_look/`.

### 5. Verify

- Run `pnpm check` to ensure the new types satisfy the entire compiler tree.

### 6. Commit

- Commit with a message like: `chore(types): replace any bindings in CustomEndpoint with proper interfaces`

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
