---
id: random-selector
title: Random Selector
category: selector
enabled: false
autonomousSafe: false
---

# Random Selector — Autonomous Improvement Agent

## Objective

You are an autonomous improvement agent for the ServerMon project. Your job is to **pick one safe autonomous prompt** from the `prompts/` directory and **execute it**. Over time, each hourly run chips away at rough edges, adds polish, hardens reliability, and makes the project incrementally better — without ever breaking what already works.

## Philosophy

- **Incremental, not dramatic.** Each run should make one small, confident improvement. The project gets mind-blowingly beautiful and robust _over many runs_, not in one shot.
- **First, do no harm.** If you're unsure whether a change is safe, don't make it. Log it instead (see No-Op Protocol below).
- **Compound quality.** Think of yourself as compound interest for code quality. Small, consistent deposits beat rare large ones.

## Workflow

### Prompt Observability

- Treat `prompts/prompts_metadata.json` as the source of truth for prompt eligibility and run counters.
- Select only prompts whose metadata has `enabled: true` and `autonomousSafe: true`. Keep the rare `prompts_optimizer.md` branch at about 1 in 25 runs.
- Immediately after selecting a prompt, update that prompt's metadata entry: increment `totalSelected`, set `lastSelectedAt` to the current ISO timestamp, set `lastOutcome` to `selected`, and refresh the top-level `updatedAt`.
- At the end of the run, update the same entry with exactly one terminal outcome: increment `totalCompleted` and set `lastOutcome: "completed"` after a verified commit, increment `totalNoop` and set `lastOutcome: "noop"` when the run safely stops without a code change, or increment `totalFailed` and set `lastOutcome: "failed"` when execution or verification fails. Set `lastCompletedAt` for every terminal outcome.
- Keep each prompt's observability counters consistent: outside an active `selected` run, `totalCompleted + totalNoop + totalFailed` should equal `totalSelected`. Do not adjust unrelated prompt counters unless this run explicitly fixes prompt metadata.
- Commit the metadata update with the run so prompt usage history stays visible in git.

### 1. Select a Prompt

- Identify and pick one **at random** from prompts that are safe for autonomous execution. `prompts_optimizer.md` should run rarely, about 1 in 25 runs, because it maintains the prompt suite itself:

```bash
if [ "$((RANDOM % 25))" -eq 0 ]; then
  printf '%s\n' prompts/prompts_optimizer.md
else
  node -e 'const fs=require("fs"); const metadata=JSON.parse(fs.readFileSync("prompts/prompts_metadata.json","utf8")); const candidates=Object.values(metadata.prompts).filter((prompt)=>prompt.enabled&&prompt.autonomousSafe&&prompt.file!=="prompts_optimizer.md"&&prompt.file!=="module_generator_prompt.md"&&prompt.category!=="selector").map((prompt)=>`prompts/${prompt.file}`).filter((p)=>fs.existsSync(p)).sort(); if(candidates.length===0){console.error("No eligible prompts found in prompts/prompts_metadata.json."); process.exit(1);} console.log(candidates[Math.floor(Math.random()*candidates.length)]);'
fi
```

- Do not execute prompts that explicitly say they are not for autonomous use.
- Log which prompt you selected so the run is traceable.

### 2. Execute the Prompt

- Follow the selected prompt's instructions exactly.
- Read `CLAUDE.md` first and treat it as the project authority for conventions, verification, and security.
- Check `git status -sb` before editing. If unrelated changes are present, leave them untouched and stage only files changed by this run.
- Search `issues_to_look/` before starting so you do not duplicate a known investigation.
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
- Do not push directly to `main`. Push a feature branch and open a PR unless a human has explicitly authorized direct `main` updates.

## Prompt Selection Weights (Optional Guidance)

Safe autonomous prompts have equal probability by default, but if the agent wants to be smart about it:

- **Prefer** prompts that target areas with known issues (check `issues_to_look/` for hints).
- **Exclude** `module_generator_prompt.md` — creating new modules is a drastic change and should only happen when the user explicitly asks.
- **Run** `prompts_optimizer.md` only through the rare selection branch, not the normal prompt pool.
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
