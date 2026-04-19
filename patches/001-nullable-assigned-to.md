# 001 — `assigned_to` must be nullable in task update schema

**Target:** `/app/src/lib/validation.ts` line ~40
**Affects:** `PUT /api/tasks/<id>` body validation
**Applied by:** `mc-kit patch-mc`

## The bug

MC's task-detail UI sends `{"assigned_to": null}` when the user picks
"Unassigned" from the dropdown, but the Zod schema rejects null with a
400 "expected string, received null" error. The UI's onChange catch
block swallows the error silently, so the change appears to revert.

```
src/components/panels/task-board-panel.tsx:1571
  const newAssignee = e.target.value || null   ← sends null
```

vs.

```
src/lib/validation.ts:40
  assigned_to: z.string().max(100).optional()   ← rejects null
```

## The fix

Make the validation accept null too:

```diff
- assigned_to: z.string().max(100).optional(),
+ assigned_to: z.string().max(100).nullable().optional(),
```

Upstream-clean fix. Same file, one token added.

## Idempotency marker

The patched file contains `.max(100).nullable().optional()` — we detect
that to skip re-applying.

## How to apply manually

If `mc-kit patch-mc` isn't an option, a one-liner:

```bash
podman exec mission-control sh -c '
  sed -i "s/assigned_to: z.string().max(100).optional()/assigned_to: z.string().max(100).nullable().optional()/" /app/src/lib/validation.ts
  cd /app && pnpm build >/dev/null 2>&1
'
mc-kit ide:stop && mc-kit ide:start
```

## Upstream status

Not yet filed. Filing a PR at builderz-labs/mission-control is still
worth it — the fix is tiny and correct for all users.
