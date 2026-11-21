# Endpoint Token Auth Blocked by Formatting Drift

Selected prompt: `prompts/security_auditor.md`

## Issue

The endpoint token management routes lack explicit `getSession()` checks before listing,
creating, and revoking custom endpoint tokens:

- `src/app/api/modules/endpoints/[id]/tokens/route.ts`
- `src/app/api/modules/endpoints/[id]/tokens/[tokenId]/route.ts`

## Proposed Fix

Add session checks to `GET`, `POST`, and `DELETE` handlers and cover unauthenticated
requests with focused route tests that assert `401` and no token-service calls.

## Why This Run Stopped

The focused token route tests passed after the patch, but required verification failed
at `pnpm format:check` on unrelated existing files:

- `src/modules/ai-agents/ui/components/SessionDetail.tsx`
- `src/modules/disk/ui/DiskSettingsModal.tsx`

Per `prompts/random_selector.md`, the security patch was reverted and this blocker was
logged instead of committing an unverified behavior change.
