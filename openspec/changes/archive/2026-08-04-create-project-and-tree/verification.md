# Verification evidence

## MySQL migration round trip

- Command: `cd backend && .venv/bin/python tools/verify_project_tree_mysql.py`
- Database: `knowstruct_pytest_test` (the verifier rejects database names without the `_test` suffix and refuses non-empty databases)
- Result: PASS on 2026-08-04. Alembic upgraded `0001_auth` and `0002_project_tree`; MySQL enforced project-status and sibling-name constraints; same-name nodes in different sibling scopes succeeded; project deletion cascaded to nodes; downgrade returned the database to an empty state.

## Responsive browser acceptance

- URL: `http://localhost:5174/` with the local MySQL-backed API on port 8001.
- Desktop result: PASS at 1440x900. Verified the seeded renovation tree, project create/status/delete, empty directory, node selection and breadcrumb, rename identity, duplicate rejection with preserved input, menu movement, pointer drag reorder, cycle-target exclusion, rejected seventh-level result, and four-node subtree deletion with authoritative refresh.
- Mobile result: PASS at 390x844. Verified root-to-leaf drill-down, back/breadcrumb navigation, leaf and empty-node states, loading and failed/retry states, text fit, keyboard retry focus, no horizontal overflow, and no clipped or overlapping controls.
- No-project result: PASS using a separate empty local Workspace. During this check, account switching exposed stale React Query data from the previous Workspace; login/logout/401 cache clearing and a regression test were added, then the same in-app account switch passed without a reload.

## Automated suites

- Backend: `cd backend && .venv/bin/pytest -q` -> 31 passed; `.venv/bin/ruff check .` -> all checks passed.
- Frontend: `cd frontend && npm test -- --run` -> 7 files and 26 tests passed; `npm run lint` -> passed; `npm run build` -> passed with a 359.64 kB JavaScript bundle (112.60 kB gzip).
- OpenSpec: `openspec validate --all --strict` -> 2 items passed, 0 failed. Delta-spec and Non-goal review found no P1 import/template/archive, AI adoption, graph, collaboration, cross-project-node, or complex-permission behavior in this Change.

## Main-spec sync

- Synced the Change's six `knowledge-directory` requirements and four `project-management` requirements into newly created main specs.
- Post-sync `openspec validate --all --strict` -> 4 items passed, 0 failed.
- No routed product-context update was needed because implementation did not change a confirmed product decision. Archival was completed after explicit user confirmation.

## Directory action-menu clipping regression

- Fixed the desktop node action menu being clipped by the scrollable tree container in low-height viewports. The menu now renders at the document root with fixed viewport positioning and flips above the trigger when there is insufficient space below.
- Added a regression assertion for a trigger near the viewport bottom, including portal ownership and upward placement.
- Frontend verification after the fix: 7 test files / 26 tests passed, lint passed, and production build passed.

## Directory drag-intent regression

- Added an always-available Project-root drop target so a nested subtree can be promoted back to the root level without opening the move dialog.
- Split each desktop tree row into top, center, and bottom drop intent: place before, move inside, and place after. The active target now shows a line or contained highlight; keyboard reordering and the accessible move dialog remain available.
- Added pure mapping coverage for root promotion, sibling placement, child placement, cycle rejection, no-op rejection, and geometry thresholds. Frontend verification: 7 test files / 28 tests passed, lint passed, and production build passed with a 362.00 kB JavaScript bundle (113.38 kB gzip).
- Desktop browser check passed on the existing nested `测试项目02` sample: the fixed root target, level indicators, 280px directory column, and content layout rendered without clipping or overlap. Existing directory data was not mutated during the check.
- `openspec validate --all --strict` passed all 4 items after the regression fix and before archival.

## Archive closeout

- User confirmed archival on 2026-08-04. Both delta-spec Requirement/Scenario bodies were compared with their main specs and were already synchronized; only the main-spec title, Purpose, and Requirements wrapper differed as expected.
- Archived as `openspec/changes/archive/2026-08-04-create-project-and-tree`. Task 6.6 was marked complete after the move and no routed product-context update was required.
