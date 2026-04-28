# AI Runner Multi Schedule Editor Design

Date: 2026-04-28

## Goal

Add a faster editing surface for existing AI Runner schedules. The feature lets an operator update cron cadence, timeout, and retry count across many schedules from one modal, validate the full batch before saving, and optionally populate edits by pasting CSV.

This is for editing existing schedules only. It does not create schedules, delete schedules, change prompts, change profiles, change workspaces, toggle enabled state, or replace the existing single-schedule editor.

## User Flow

1. The AI Runner schedules tab shows a new `Multi Schedule Editor` action near the existing schedule actions.
2. Clicking it opens a wide modal containing a table of current schedules.
3. Each row shows identifying context plus editable fields:
   - schedule name
   - prompt name
   - profile name
   - current next launch
   - cron expression
   - timeout in minutes
   - retries
   - row status or validation error
4. The user edits rows directly or opens the CSV paste editor.
5. CSV paste imports values into matching existing rows and marks those rows dirty.
6. Save is disabled unless at least one row has changed.
7. Save validates the whole batch server-side before applying anything.
8. If validation fails, no schedules are updated and the modal shows row-level errors.
9. If validation passes, all changed rows are updated, `nextRunTime` is recalculated, the modal closes, and the schedules list refreshes.

## CSV Import

The CSV paste editor lives inside the modal. It includes short instructions and accepts either of these formats:

```csv
name,cronExpression,timeout,retries
Nightly cleanup,0 2 * * *,45,1
```

```csv
id,cronExpression,timeout,retries
665000000000000000000001,*/30 * * * *,30,0
```

Matching rules:

- If `id` is present, match by schedule id.
- Otherwise match by exact schedule name.
- Unknown ids, unknown names, duplicate CSV targets, and ambiguous schedule names block import.
- CSV import updates table draft values only. It never creates schedules.
- CSV rows may omit unchanged editable fields, but each row must include either `id` or `name`.

Accepted CSV columns:

- `id`
- `name`
- `cronExpression`
- `timeout`
- `retries`

Any other column is rejected so mistakes are visible.

## Validation

Validation has two layers.

Client-side draft validation catches fast, local problems:

- row target does not map to an existing schedule
- cron expression is blank
- timeout is not an integer from `1` to `1440`
- retries is not an integer from `0` to `9`
- CSV has duplicate targets
- CSV has unsupported columns

Server-side bulk validation is authoritative. It validates every changed row before saving any row:

- schedule id exists
- cron expression can produce a next run time for enabled schedules
- timeout and retries satisfy the same schema limits used by normal schedule editing
- each update is limited to `cronExpression`, `timeout`, and `retries`

If any update fails server validation, the endpoint returns all detected row errors and applies no changes.

## API Design

Add a dedicated route:

`POST /api/modules/ai-runner/schedules/bulk-update`

Request:

```json
{
  "updates": [
    {
      "id": "665000000000000000000001",
      "cronExpression": "0 2 * * *",
      "timeout": 45,
      "retries": 1
    }
  ]
}
```

Successful response:

```json
{
  "schedules": [],
  "updatedCount": 1
}
```

Validation failure response:

```json
{
  "error": "Bulk schedule update failed validation",
  "rowErrors": [
    {
      "id": "665000000000000000000001",
      "field": "cronExpression",
      "message": "Invalid cron expression"
    }
  ]
}
```

The endpoint should:

1. Require session authentication.
2. Parse input with Zod.
3. Load all referenced schedules.
4. Build candidate schedule values without mutating documents.
5. Validate all candidates, including next-run calculation.
6. If any row is invalid, return `400` with row errors.
7. If all rows are valid, apply the updates and return the updated schedule DTOs.
8. Call `ensureAIRunnerSupervisor()` after successful mutation, matching the existing single-schedule update behavior.

The first implementation does not require a Mongo transaction. The important guarantee for this feature is pre-save all-or-none validation. The service should still structure validation and mutation as separate phases so a future transaction can wrap the mutation phase if needed.

## Frontend Design

Add a focused component, for example:

`src/modules/ai-runner/ui/components/MultiScheduleEditorModal.tsx`

Responsibilities:

- receive schedules and display table draft rows
- track dirty rows
- validate drafts locally
- parse CSV paste input
- show import errors and row errors
- call the bulk update endpoint
- report success to the parent so `AIRunnerPage` can refresh data

Keep schedule list ownership in `AIRunnerPage`. The parent opens/closes the modal, passes current schedule data, and reloads schedules after success.

The modal should follow the existing AI Runner UI style:

- wide fixed modal layout
- compact table-like rows
- sticky footer with Cancel and Save
- icon button for CSV import
- row-level errors in a dedicated status column
- avoid changing the existing single schedule modal

## Error Handling

- Invalid local draft values keep Save disabled and show row messages.
- Server validation errors keep the modal open and attach messages to matching rows.
- A non-validation server failure shows a destructive toast and keeps the modal open.
- If schedules changed in another tab before save, the server should return row errors for missing schedules or rejected values. The user can refresh by closing and reopening the modal.

## Testing

Add focused coverage for:

- bulk update route validates and updates multiple schedules
- bulk update route rejects invalid cron without updating any schedule
- bulk update route rejects attempts to update unsupported fields
- modal opens from the schedules tab
- table edits mark rows dirty and enable Save
- invalid timeout or retries disables Save
- CSV paste by name populates matching rows
- CSV paste by id populates matching rows
- duplicate or unknown CSV targets show errors
- successful save calls the bulk endpoint and refreshes schedules

Run the required project checks before implementation is considered complete:

- `pnpm format:check`
- `pnpm check`
