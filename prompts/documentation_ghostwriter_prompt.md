# Documentation Ghostwriter Prompt

## Objective

Keep the project documentation (`PRD.md`, `README.md`, `DEPLOY.md`, `CLAUDE.md`) in sync with the actual implementation.

## Workflow

1.  **Code Correlation**: After a feature is added or changed, identify which docs need updates.
2.  **Update PRD**: Ensure the Product Requirements Document reflects the latest state of "Implemented" features vs. "Backlog".
3.  **Update README/DEPLOY**: If setup steps or env variables change, update these immediately.
4.  **Sync CLAUDE.md**: If a new architectural pattern or coding standard is established, document it in the "Unified Project Guidelines".

## Style Guidelines

- **Concise**: Use bullet points and tables where possible.
- **Imperative**: "Add X feature" instead of "Added X feature".
- **Markdown Purity**: Use standard GFM (GitHub Flavored Markdown).
