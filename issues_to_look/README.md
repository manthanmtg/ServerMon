# Issues to Look At

This directory contains issues logged by autonomous AI agent runs (via `random_selector.md`) that were **too risky, too complex, or too ambiguous** to fix automatically.

## How It Works

- When an agent encounters something that needs fixing but can't safely do it in an incremental run, it creates a file here.
- Files are named `YYYY-MM-DD_<short-slug>.md` with a description of the issue, proposed fix, and why the agent held back.
- A future agent run (or a human) can review these and act on them.

## For Agents

- **Before creating a new issue**: Check if a similar issue already exists. If it does, **skip** — don't create duplicates.
- **When you fix an issue**: Delete the corresponding file from this directory.
- **Keep it brief**: Issue descriptions should be 5–15 lines, not essays.
