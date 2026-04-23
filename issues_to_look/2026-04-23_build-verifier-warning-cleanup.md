# Build Verifier Warning Cleanup

## Selected prompt

`prompts/build_verifier.md`

## What I checked

- Ran `pnpm check` on `main` after updating to the latest remote commit.
- Result: all checks passed, but the Vitest run emitted many warning-class messages to stdout/stderr.

## Why I held back

The selected prompt requires a clean build with zero warnings, but the warning surface is broader than one safe, reviewable fix. Cleaning it up would require touching multiple unrelated areas and exceeds the prompt's limit of a minimal targeted change.

## Warning categories observed

- Recharts SVG mock warnings in multiple tests, including `UpdatePage`, `MemoryWidget`, `CPUChartWidget`, and `MemoryChartWidget`
- React `act(...)` warnings in multiple widget tests, including `ServicesWidget`, `PasskeySettings`, `NetworkWidget`, `HardwareWidget`, `NginxWidget`, `AIAgentsWidget`, and `EndpointsWidget`
- Intentional logger output from tests that currently reaches stderr/stdout
- Environment noise such as `window.scrollTo()` not implemented and `global-error` HTML nesting warnings

## Proposed follow-up

Tackle this as a dedicated warning-cleanup pass:

1. Normalize shared `recharts` test mocks so SVG elements render inside an SVG container.
2. Add or centralize async render helpers for components with mount-time effects to eliminate `act(...)` warnings.
3. Silence expected logger output in tests by mocking the logger at the test boundary.
4. Patch environment-specific warnings in shared test setup where appropriate.

## Why this was a no-op

Making only one of these fixes would still leave the selected prompt incomplete, and addressing all of them safely is larger than a single small autonomous run.
