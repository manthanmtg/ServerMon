# Guidelines Sync Blocked by Users Page Tests

## Context

- Selected prompt: `prompts/project_guidelines_sync.md`
- Attempted change: add a small `CLAUDE.md` workspace-index section for the existing Users module, service, route, and API files.
- Verification command: `pnpm check`

## Failure

`pnpm check` failed in `src/modules/users/ui/UsersPage.test.tsx` with 7 failed tests.

The failures are caused by duplicate text matches in the test DOM. `UsersPage` renders both the mobile card view and the desktop table view at the same time, hiding one with responsive CSS classes. In jsdom, those CSS breakpoints do not remove the hidden view from queries, so tests such as `screen.getByText('root')`, `screen.getByText('user1')`, and `screen.getByText(/Scanning identity records/i)` see both mobile and desktop copies.

## Evidence

- `renders loading state initially`: `getByText(/Scanning identity records/i)` found both the mobile loading card and the desktop table loading cell.
- `renders OS users by default`: `getByText('root')` found both mobile and desktop rendered copies.
- `deletes an OS user with confirmation`: `getByText('user1')` found both mobile and desktop rendered copies.
- Final summary: 1 failed test file, 7 failed tests, 4458 passed tests.

## Proposed Fix

Update `src/modules/users/ui/UsersPage.test.tsx` to scope assertions and interactions to the intended responsive surface, or update `UsersPage` to mark the inactive duplicate surface as hidden from accessibility/testing queries. Prefer a test-only query-scope correction if the dual-rendering layout is intentional for responsive UI.

## Why This Was Held Back

The selected `project_guidelines_sync` prompt only permits changes to `CLAUDE.md`, `AGENTS.md`, or an `issues_to_look/` note created by the run. Fixing the users page tests or component would exceed that prompt scope, so the documentation edit was reverted and this investigation note was recorded instead.
