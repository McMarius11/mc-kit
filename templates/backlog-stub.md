# Backlog — {{PROJECT_NAME}}

Source-of-truth for planned and completed work. Synced bidirectionally with
Mission Control via `mc-kit sync`.

## Conventions

- **ID format:** `#B<NN>` — integer, never reused. On completion, move to
  "Done" with date + commit SHA. Don't delete.
- **Theme tag:** exactly one of `[AUDIT] [PARITY] [UX] [PERF] [TRUST]`
  (adjust in `.mc-kit.json` if your project uses different themes).
- **Commit referencing:** include the item ID in the commit body
  (e.g. `Implements #B04`).

## High priority

- [ ] `#B01` `[TRUST]` First high-priority item — replace this

## Medium priority

- [ ] `#B02` `[UX]` Medium-priority example

## Low priority

- [ ] `#B03` `[PERF]` Nice-to-have example

## Done

<!-- Moved here when completed. Include date + commit SHA. -->
