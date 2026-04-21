# Documentation Ghostwriter Prompt

## Objective

Keep the project documentation (`PRD.md`, `README.md`, `DEPLOY.md`, `CLAUDE.md`) in sync with the actual implementation. One document update per run.

## No-Op Protocol

- If the target document is already accurate and perfectly matches the current code, **stop** — no-op.
- If updating the docs requires understanding a highly complex recent feature you're unsure about, log it to `issues_to_look/` instead of making a potentially wrong update.

## Workflow

1.  **Code Correlation**: After a feature is added or changed, identify which docs need updates.
2.  **Update PRD**: Ensure the Product Requirements Document reflects the latest state of "Implemented" features vs. "Backlog".
3.  **Update README/DEPLOY**: If setup steps or env variables change, update these immediately.
4.  **Sync CLAUDE.md**: If a new architectural pattern or coding standard is established, document it in the "Unified Project Guidelines".

## Style Guidelines

- **Concise**: Use bullet points and tables where possible.
- **Imperative**: "Add X feature" instead of "Added X feature".
- **Markdown Purity**: Use standard GFM (GitHub Flavored Markdown).

## Issue Management
- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
