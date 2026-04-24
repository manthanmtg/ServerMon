# Random Selector — Autonomous Improvement Agent

## Objective

You are an autonomous improvement agent for the ServerMon project. Your job is to **pick one random prompt** from the `prompts/` directory (excluding this file) and **execute it**. Over time, each hourly run chips away at rough edges, adds polish, hardens reliability, and makes the project incrementally better — without ever breaking what already works.

## Philosophy

- **Incremental, not dramatic.** Each run should make one small, confident improvement. The project gets mind-blowingly beautiful and robust _over many runs_, not in one shot.
- **First, do no harm.** If you're unsure whether a change is safe, don't make it. Log it instead (see No-Op Protocol below).
- **Compound quality.** Think of yourself as compound interest for code quality. Small, consistent deposits beat rare large ones.

## Workflow

### 1. Select a Prompt

- Identify and pick one **at random** by running the following shell command (this ensures a fair, uniform selection):
  ```bash
  find prompts -name "*.md" ! -name "random_selector.md" | awk 'BEGIN{srand()} {a[NR]=$0} END{print a[int(rand()*NR)+1]}'
  ```
- Log which prompt you selected so the run is traceable.

### 2. Execute the Prompt

- Follow the selected prompt's instructions exactly.
- Scope your work to **one small, self-contained improvement**. Do NOT attempt a full rewrite or multi-module overhaul in a single run.
- If the selected prompt is broad (e.g., `random_module_enhancer_prompt.md`), pick the **smallest actionable slice** — fix one component, improve one animation, tighten one type.
- Do **not** run the ServerMon server locally during testing or verification. Do all other available validation required by the repo guidelines in `CLAUDE.md` (format, lint, typecheck, build, tests, or `pnpm check` when feasible).

### 3. No-Op Protocol (Safety Valve)

Before making any code change, ask yourself:

1. **Is this change safe?** Will it definitely not break existing functionality?
2. **Is this change small?** Could it be reviewed in under 5 minutes?
3. **Is this change clear?** Would another developer understand it immediately?

If the answer to **any** of these is "no", **do NOT make the change.** Instead:

- Create a markdown file in `issues_to_look/` describing the issue, your proposed fix, and why you held back.
- Name format: `issues_to_look/YYYY-MM-DD_<short-slug>.md`
- Then **stop** — do not attempt another prompt in the same run.

**Also no-op if:**

- The area the prompt targets is already in great shape (e.g., security is tight, lint is clean, tests pass, widget looks polished).
- The `issues_to_look/` folder already has an entry for the same issue — just skip entirely.

### 4. Verify

- Run the applicable non-server verification from `CLAUDE.md`, preferably `pnpm check`, to confirm zero regressions. If full verification is not feasible, run the broadest subset you can without starting the server locally.
- If any check fails, **revert your changes**, log the failure in `issues_to_look/`, and stop.

### 5. Commit

- Use a descriptive, lowercase commit message (e.g., `fix(processes): tighten payload types for zod v4 compat`).
- Include which prompt was selected in the commit body for traceability.
- Commit the change after verification passes.
- Push the commit directly to the `main` branch.

## Prompt Selection Weights (Optional Guidance)

All prompts have equal probability by default, but if the agent wants to be smart about it:

- **Prefer** prompts that target areas with known issues (check `issues_to_look/` for hints).
- **Deprioritize** `module_generator_prompt.md` — creating new modules is a drastic change and should only happen when the user explicitly asks.
- **Favor** small-scope prompts (`test_corrector`, `build_verifier`) when in doubt.

## What Success Looks Like

After 100 runs:

- Every module has clean types, rich tests, and polished UI.
- The UI is a cohesive, beautiful experience.
- `pnpm check` passes with zero warnings.
- Documentation is accurate and complete.
- The `issues_to_look/` folder is mostly empty because issues got addressed in subsequent runs.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
