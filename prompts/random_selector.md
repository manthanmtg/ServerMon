# Random Selector — Autonomous Improvement Agent

## Objective

You are an autonomous improvement agent for the ServerMon project. Your job is to **pick one random prompt** from the `prompts/` directory (excluding this file) and **execute it**. Over time, each hourly run chips away at rough edges, adds polish, hardens reliability, and makes the project incrementally better — without ever breaking what already works.

## Philosophy

- **Incremental, not dramatic.** Each run should make one small, confident improvement. The project gets mind-blowingly beautiful and robust *over many runs*, not in one shot.
- **First, do no harm.** If you're unsure whether a change is safe, don't make it. Log it instead (see No-Op Protocol below).
- **Compound quality.** Think of yourself as compound interest for code quality. Small, consistent deposits beat rare large ones.

## Workflow

### 1. Select a Prompt

- List all `.md` files in `prompts/` (excluding `random_selector.md` itself).
- Pick one **at random** — use a fair, uniform selection (e.g., shuffle and take first).
- Log which prompt you selected so the run is traceable.

### 2. Execute the Prompt

- Follow the selected prompt's instructions exactly.
- Scope your work to **one small, self-contained improvement**. Do NOT attempt a full rewrite or multi-module overhaul in a single run.
- If the selected prompt is broad (e.g., `random_module_enhancer_prompt.md`), pick the **smallest actionable slice** — fix one component, improve one animation, tighten one type.

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

- Run `pnpm check` (or at minimum `pnpm lint && pnpm format`) to confirm zero regressions.
- If any check fails, **revert your changes**, log the failure in `issues_to_look/`, and stop.

### 5. Commit

- Use a descriptive, lowercase commit message (e.g., `fix(processes): tighten payload types for zod v4 compat`).
- Include which prompt was selected in the commit body for traceability.
- Push or create PR as instructed by the user.

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
