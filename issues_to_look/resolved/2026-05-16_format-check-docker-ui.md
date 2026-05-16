# Format check blocker in Docker UI files

## Context

The autonomous run selected `prompts/random_module_enhancer_prompt.md` and audited the
`network` module. A small regression was found in `NetworkWidget`: the widget treats interface
names containing `lo`, such as `wlo1`, as loopback because it uses a substring check.

## Proposed fix held back

Replace the substring check with a narrow loopback predicate that only matches known loopback
names (`lo`, `lo0`, and `lo:*`), with a focused regression test for `wlo1`.

## Why this was not changed

The focused widget test passed after the proposed change, but the required repository
verification step `pnpm format:check` failed on unrelated existing files:

- `src/modules/docker/ui/components/AssetManager.tsx`
- `src/modules/docker/ui/DockerPage.tsx`

The selected prompt requires reverting changes and logging the blocker when verification fails, so
the network widget change was not kept in this run.
