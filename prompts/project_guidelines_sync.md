# Project Guidelines Sync Prompt

## Objective

Keep `CLAUDE.md` and `AGENTS.md` aligned with the actual ServerMon codebase and repository workflow. This prompt focuses only on agent-facing project rules, conventions, commands, and workspace index accuracy.

## Philosophy

Agent guidelines are operational infrastructure. If they drift from the codebase, automated runs make worse choices, duplicate work, or miss required checks. Small, evidence-backed updates keep future agents effective without turning docs into stale wishlists.

## Workflow

### 1. Audit for Drift

Review one recent area of change and compare it against the current guidelines:

- `git log --oneline -10` for recent implementation themes.
- `package.json` for command or dependency changes.
- `src/`, `docs/`, `module_ideas/`, `prompts/`, and `issues_to_look/` for added, moved, or removed major directories and workflows.
- Existing patterns in nearby code before documenting any new convention.

### 2. Update `CLAUDE.md` Only When Evidence Supports It

Make a small update if one of these is true:

- A command, required check, environment variable, or setup step changed.
- A major directory, module, route group, model group, or workflow was added or removed.
- A repeated implementation pattern has become a project convention.
- An existing guideline contradicts the current codebase.

Do not add aspirational rules that the repository does not currently follow.

### 3. Keep `AGENTS.md` as the Pointer

- Confirm `AGENTS.md` still points agents to `CLAUDE.md` as the unified source of truth.
- Keep it short. Do not duplicate the full guideline body there.
- Update `AGENTS.md` only if the pointer text is broken, stale, or inconsistent with the unified-guidelines model.

### 4. Scope Guardrail

- Change only `CLAUDE.md`, `AGENTS.md`, or an `issues_to_look/` note created by this run.
- If the needed update requires understanding a large unfinished feature, log the uncertainty in `issues_to_look/YYYY-MM-DD_guidelines-drift-<slug>.md` and stop.
- If both files are already accurate, log "project guidelines are current" and no-op.

### 5. Verify

- Run `pnpm exec prettier --check CLAUDE.md AGENTS.md` when either file changes.
- Run `git diff --check`.
- If the guideline update changes required commands or documented checks, run the affected command or explain why it was not feasible.

### 6. Commit

- Commit with a message like: `docs(guidelines): sync agent instructions with fleet routes`.
- In the commit body, list the evidence that justified the guideline update.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
