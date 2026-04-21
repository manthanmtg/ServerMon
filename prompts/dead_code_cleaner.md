# Dead Code Cleaner Prompt

## Objective

Find and remove **dead code** — unused exports, unreachable functions, orphaned files, commented-out blocks, and stale dependencies — to keep the codebase lean and navigable.

## Philosophy

Dead code is mental clutter. It misleads future developers (and AI agents), inflates the bundle, and makes the codebase feel heavier than it is. Removing a little each run keeps things clean.

## Workflow

### 1. Scan for Dead Code

Pick one category per run:

- **Unused exports**: Functions, constants, or types exported but never imported anywhere.
- **Commented-out code**: Large blocks of `// old implementation` that serve no purpose.
- **Orphaned files**: Files in `src/` that are not imported by any other file.
- **Stale dependencies**: Packages in `package.json` that are no longer imported anywhere in `src/`.
- **Unused CSS**: Classes defined in stylesheets but never referenced in components.

### 2. Verify It's Actually Dead

- **Search thoroughly**: Use ripgrep to confirm the export/file/dependency is genuinely unused. Check dynamic imports, string-based references, and test files.
- **Be conservative**: If there's any ambiguity, do NOT remove it. Log it to `issues_to_look/` with your analysis.

### 3. Remove (Small Batches)

- Remove **at most 5 dead items** per run.
- If removing something requires changing other files, keep the total diff under 30 lines.

### 4. Verify

- Run `pnpm check` — must pass cleanly.
- If anything breaks, revert immediately and log to `issues_to_look/`.

### 5. Commit

- Commit with a message like: `chore: remove unused processStats export from utils`
- List what was removed and why in the commit body.

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
