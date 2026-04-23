# Script Editor motion polish blocked by missing animation dependency

## Selected prompt

- `prompts/visual_polish_artist_prompt.md`
- Random target: `src/modules/endpoints/ui/components/ScriptEditor.tsx`

## What I planned

Apply one small visual polish improvement to the script editor chrome:

- replace hardcoded shell colors with theme-token-based glass styling
- add subtle hover/tap feedback to the editor frame
- keep the CodeMirror layout and behavior unchanged

## Why I held back

The selected prompt explicitly calls for `framer-motion` transitions. This repository does not currently include `framer-motion`, and the attempted implementation failed repo verification:

```text
src/modules/endpoints/ui/components/ScriptEditor.tsx(5,24): error TS2307: Cannot find module 'framer-motion' or its corresponding type declarations.
```

Adding a new runtime dependency for a single, cosmetic change is larger than this hourly run should take on under the random selector safety rules.

## Proposed follow-up

Pick one of these paths in a dedicated change:

1. Add `framer-motion` intentionally, then polish a few shared interactive surfaces so the dependency has project-wide value.
2. Update the prompt to allow CSS-only motion when `framer-motion` is not installed.
3. Refactor `ScriptEditor` chrome to use theme tokens first, then add motion later once an animation library decision is made.

## Status

- No functional code changes were kept.
- The attempted change was reverted after verification failed.
