# 001 — `assigned_to` must be nullable in task update schema

**Target:** `src/lib/validation.ts` line ~40
**Affects:** `PUT /api/tasks/<id>` body validation

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

## Recommended workaround: CLI

The simplest fix for users is to stay on the mc-kit CLI:

```bash
mc-kit unassign <task-id>
```

This sends `{"assigned_to": ""}` which the current schema accepts. No
container rebuild, no image patching, no upstream dependency. The UI
dropdown display may look stale ("Claude Code (external)" still shown),
but the DB is correctly empty and `watch-dispatch` won't pick it up.

## If you really want the UI fix

The Mission Control container is a slim production image: `/app/src/`
is mounted read-only and `pnpm` isn't installed at runtime. You cannot
sed the source from inside the container. The fix has to happen at the
**host source tree** (`~/Arbeit/mission-control/` in the default setup),
followed by a full image rebuild.

```bash
# 1. Patch source on the host (NOT inside the container)
sed -i 's/assigned_to: z.string().max(100).optional()/assigned_to: z.string().max(100).nullable().optional()/' \
  ~/Arbeit/mission-control/src/lib/validation.ts

# 2. Rebuild the container image (3-8 min first time, faster with layer cache)
cd ~/Arbeit/mission-control
podman-compose build

# 3. Restart
mc-kit ide:stop && mc-kit ide:start
```

Every MC upgrade that touches `validation.ts` wipes the patch — you'd
re-apply after `git pull`. That maintenance cost is why the CLI
workaround is the default recommendation.

## Proper fix: upstream PR

The real solution is a 2-line PR against builderz-labs/mission-control:

```diff
- assigned_to: z.string().max(100).optional(),
+ assigned_to: z.string().max(100).nullable().optional(),
```

Not filed yet.
