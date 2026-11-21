# AI Runner — Prompt Templates (PRD)

## Summary

Introduce a **Prompt Templates** layer on top of the existing AI Runner prompt library. A template is a reusable _scaffold_ — a pre-written instruction block with placeholders — that a user can load when authoring a new prompt or when launching an ad-hoc run, and then edit before saving or executing.

Templates come from two sources:

- **Built-in (ServerMon-maintained)** — shipped in the repository, versioned with the app, curated for common DevOps agent flows.
- **User-defined** — created by the operator, stored in MongoDB, private to the instance.

## Motivation

- Today, every prompt starts from a blank textarea in the Run tab and in the Prompt authoring modal (`AIRunnerPage.tsx`).
- Good agent prompts have a lot of ritual boilerplate: `checkout main`, `git pull`, `run tests`, `create PR via gh`, `open issue`, etc.
- Users keep re-typing the same scaffolding, often inconsistently, which makes agent runs less predictable.
- There is no way to share a "known good" prompt recipe across users, machines, or teams without copy-pasting from chat.
- Saved prompts (`AIRunnerPrompt`) solve _reuse of a specific, finished prompt_. Templates solve _reuse of a structure_ that still needs a task-specific body filled in.

## Example Template

```text
# Update & PR Template
1. git checkout main
2. git pull --rebase origin main
3. git checkout -b {{branch_name}}

# Task
{{task_description}}

# Finish
4. Run tests: {{test_command}}
5. git add -A && git commit -m "{{commit_message}}"
6. git push -u origin {{branch_name}}
7. Open a PR using `gh pr create --fill --base main`
```

Placeholders like `{{branch_name}}` are filled in when the template is applied.

## Goals

- Let users load a template into the Run tab or the Prompt authoring modal with a single click.
- Let users define, edit, and delete their own templates.
- Ship a small, opinionated set of **built-in templates** in-repo so a fresh install is useful immediately.
- Clearly distinguish **built-in vs user-defined** in the UI and prevent editing of built-ins (only "Clone to my templates").
- Keep templates _completely separate_ from the `AIRunnerPrompt` model. Templates are scaffolds, prompts are the finished thing actually run by the agent.
- Support simple `{{placeholder}}` variable substitution with a lightweight variable picker before insertion.

## Non-Goals

- Full templating language (no loops, conditionals, includes). Keep it to string placeholders.
- Template marketplace / remote sync / import-from-URL. Out of scope for v1.
- Multi-tenant ACLs on templates. All user templates are visible to any authenticated operator of the instance.
- Replacing the existing saved-prompt library. Templates **augment** it, they do not replace it.

## User Stories

- As an operator in the **Run tab**, I can click **"Use Template"**, pick `Update & PR`, fill in `task_description` and `branch_name`, and the prompt textarea is populated ready to run.
- As an operator in the **Prompt modal**, I can click **"Start from template"** to seed a new saved prompt from a template, then edit and save it as a normal prompt.
- As an operator in a new **Templates tab**, I can see built-in templates, create my own, edit my own, and delete my own.
- As an operator, I can **clone a built-in template** into my user templates to customize it without losing the original.
- As a ServerMon contributor, I can add a new built-in template by dropping a file into a `templates/` directory; it ships on next release.

## UX

### New tab: `Templates`

Sibling to `Run`, `Prompts`, `Schedules`, `Settings` in `AIRunnerPage.tsx`.

Layout mirrors the existing Prompt Library:

- Left rail: search, filter by source (`All`, `Built-in`, `Mine`), filter by tag.
- Main pane: compact list rows. Each row shows `name`, `source badge` (Built-in / Mine), `tag chips`, 2-line content preview.
- Selected row preview pane with full content, `{{placeholders}}` highlighted, and actions: `Use in Run`, `Start new prompt from this`, `Clone to my templates`, `Edit` (user-only), `Delete` (user-only).

### Load-from-template affordance

Add a **"Load template"** button to:

- The Run tab, next to `Save as prompt` / `Reset`.
- The Prompt authoring modal header.

Clicking opens a lightweight **Template Picker** modal:

- Search + source filter.
- On select, if the template has `{{placeholders}}`, show an inline form with one input per placeholder (with optional description + default from the template definition).
- `Insert` replaces the target textarea content. If the target textarea is non-empty, confirm overwrite or offer `Insert at cursor` / `Replace`.

### Visual distinction

- Built-in templates: subtle accent border + "Built-in" badge. Edit/Delete disabled. `Clone` primary action.
- User templates: normal styling. Full CRUD.

## Data Model

New Mongoose model alongside `AIRunnerPrompt`:

```ts
// src/models/AIRunnerPromptTemplate.ts
interface IAIRunnerPromptTemplate {
  name: string; // required, max 160
  description?: string; // optional short one-liner
  content: string; // template body, may contain {{placeholders}}, max 100_000
  variables: Array<{
    key: string; // matches /^[a-z][a-z0-9_]*$/i
    label?: string; // human label shown in picker
    description?: string;
    default?: string;
  }>;
  tags: string[];
  source: 'builtin' | 'user'; // stored for built-ins that get seeded; user-created are always 'user'
  builtinId?: string; // stable id if source === 'builtin'
  createdAt: Date;
  updatedAt: Date;
}
```

- Only documents with `source === 'user'` are mutable via the API.
- Built-ins are seeded from a static registry on app startup (idempotent upsert by `builtinId`).

### Built-in registry

In-repo, co-located with the module:

```
src/modules/ai-runner/templates/
  index.ts                      # registry export
  update-and-pr.ts
  code-review.ts
  release-notes.ts
  investigate-incident.ts
  refactor-module.ts
```

Each file exports a typed object:

```ts
export const updateAndPrTemplate: BuiltinPromptTemplate = {
  builtinId: 'ai-runner.update-and-pr',
  name: 'Update & PR',
  description: 'Pull main, do a task, push a branch, open a PR via gh cli.',
  tags: ['git', 'pr', 'workflow'],
  variables: [
    { key: 'branch_name', label: 'Branch name', default: 'feat/update' },
    { key: 'task_description', label: 'What should the agent do?' },
    { key: 'test_command', label: 'Test command', default: 'pnpm test' },
    { key: 'commit_message', label: 'Commit message' },
  ],
  content: `# Update & PR Template
1. git checkout main
...`,
};
```

## API

New routes under `/api/modules/ai-runner/prompt-templates`:

- `GET /` — list all templates (built-in + user), with `?source=`, `?search=`, `?tag=` filters.
- `GET /[id]` — detail.
- `POST /` — create (user source only).
- `PUT /[id]` — update (rejected for built-in).
- `DELETE /[id]` — delete (rejected for built-in).
- `POST /[id]/clone` — clone any template (built-in or user) into a new user template.
- `POST /[id]/render` — server-side render with a `variables` map, returns resolved `content`. Lets clients share identical substitution logic, and keeps the door open for future server-side template helpers.

Zod schemas live next to `schemas.ts` (`promptTemplateCreateSchema`, `promptTemplateUpdateSchema`, `promptTemplateRenderSchema`).

## Substitution Semantics

- Placeholder syntax: `{{key}}` — only matches `[a-z][a-z0-9_]*` case-insensitively.
- Unknown placeholders left unresolved in the rendered output are surfaced as a non-blocking warning in the picker ("2 placeholders not filled: `{{foo}}`, `{{bar}}`"), so the user can still insert a partially-filled scaffold and finish typing manually.
- Escape: `\{{key}}` renders literally as `{{key}}`.
- No HTML escaping; the rendered text goes into a plain textarea.

## Integration Points

- `AIRunnerPage.tsx` — add `Templates` tab, `Load template` buttons on Run tab and Prompt modal, Template Picker modal component.
- `src/modules/ai-runner/types.ts` — add `AIRunnerPromptTemplateDTO`, `BuiltinPromptTemplate`.
- `src/lib/ai-runner/service.ts` — add `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `cloneTemplate`, `renderTemplate`, `seedBuiltinTemplates`.
- Seed on server boot (same place Mongo connects), or lazily on first template API call. Idempotent.
- Dashboard: no new widget in v1. Optionally surface "templates used this week" in the existing AI Runner widget later.

## Rollout Plan

1. **Phase 1 — model + API.** Add model, schemas, service, routes, built-in registry with 1 seed template (`update-and-pr`). No UI changes. Add unit tests for render/substitution and clone semantics.
2. **Phase 2 — Templates tab.** Browsing, creation, editing of user templates. Clone from built-in. No integration into Run/Prompt yet.
3. **Phase 3 — Load-from-template.** Template Picker modal wired into the Run tab and the Prompt authoring modal. Variable form with previews.
4. **Phase 4 — Polish.** Ship 4–6 built-in templates, add empty-state guidance, wire tag-based filtering in picker, add a "copy rendered content" quick action.

Each phase is independently shippable.

## Open Questions

- Should scheduled runs be able to bind a template + fixed variable set, auto-rendering at run time? Interesting, but probably Phase 5+.
- Do we want a `{{#if}}` escape hatch for optional sections? Keeping it out of v1 to avoid becoming a mini-templating-engine.
- Where should built-in template definitions live if we ever support hot reload from disk (user-editable YAML on the host)? Park this until someone asks.
- Should `content` previews in the Templates tab offer syntax highlighting? Reasonable if the content is detected as shell/markdown. Defer.

## Risks

- **Confusion between Templates and Prompts.** Mitigate with copy: Templates are "scaffolds you fill in", Prompts are "ready-to-run instructions". Visually separate tabs and distinct icons.
- **Built-in churn.** Changing a built-in template silently rewrites cloned-from-scratch content — but cloning creates a user-owned copy, so clones are safe. We must _never_ overwrite a user template during seed. The seed path must only upsert docs where `source === 'builtin'`.
- **Placeholder collisions** with shell syntax (`${VAR}` is common). Using `{{name}}` avoids this cleanly.

## Acceptance Criteria

- A user can view built-in templates without logging into the filesystem.
- A user can create, edit, and delete their own templates via UI.
- A user cannot mutate a built-in template; they can clone it.
- From the Run tab, a user can load a template, fill variables, and launch a run with the rendered content.
- From the Prompt modal, a user can start a new saved prompt from a template.
- Seed on startup is idempotent — repeated restarts do not duplicate built-ins and do not overwrite user edits to their own templates.
- Rendering with all variables supplied is deterministic and byte-stable.
