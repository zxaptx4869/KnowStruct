## 1. Persistence and migration

- [x] 1.1 Add `Project` and adjacency-list `Node` SQLAlchemy models with Workspace ownership, four validated project statuses, parent relationship, normalized sibling scope, integer ordering, timestamps, cascades, and query indexes.
- [x] 1.2 Create the Alembic migration for `projects` and `nodes`, including foreign keys, status and sibling-name constraints, tree indexes, upgrade, and explicitly destructive downgrade.
- [x] 1.3 Add migration/model tests for defaults, root and child uniqueness, same-name nodes in different branches, cascades, and invalid status handling on SQLite.
- [x] 1.4 Run the migration upgrade, constraint/cascade checks, and downgrade against a disposable MySQL database ending in `_test`, and record the exact verification command and result in the Change notes or task evidence.

## 2. Project backend capability

- [x] 2.1 Add Pydantic project create, update, detail, and list schemas with trimmed field validation, status serialization, node totals, and existing API error conventions.
- [x] 2.2 Implement Workspace-scoped project service operations for list, get, create, edit, status changes, and protected transactional deletion without accepting a client-supplied Workspace.
- [x] 2.3 Add authenticated project API routes for `GET/POST /api/projects` and `GET/PATCH/DELETE /api/projects/{project_id}`, returning `404` for inaccessible objects and stable conflict errors for blocked deletion.
- [x] 2.4 Add backend project tests covering default and changed statuses, invalid fields, empty and populated lists, live node totals, mutation rollback, deletion confirmation behavior at the API boundary, unauthenticated access, and cross-Workspace isolation.

## 3. Knowledge directory backend capability

- [x] 3.1 Replace or retire the unused label-based materialized-path helpers and add ID-based tree builders and validators for ancestors, descendants, subtree height, maximum depth, sibling scopes, and stable ordering.
- [x] 3.2 Add Pydantic node create, update, list, move, and deletion-result schemas with trimmed name and description limits and stable business error codes.
- [x] 3.3 Implement Workspace- and Project-scoped node list, create, edit, rename, and path operations, including append ordering and database-backed sibling-name conflict handling.
- [x] 3.4 Implement transactional sibling reorder and cross-parent subtree movement with related sibling locking, cycle, cross-project, duplicate-name, target-position, and resulting-depth validation.
- [x] 3.5 Implement protected transactional subtree deletion with descendant counts, contiguous sibling reorder after deletion, and a service boundary for future Source / Entry / Decision reference blockers.
- [x] 3.6 Add authenticated directory API routes for list/create/update/move/delete under `/api/projects/{project_id}/nodes`, always resolving the Project through the current Workspace.
- [x] 3.7 Add backend tree tests for the real three-level renovation sample, six-level boundary, rejected seventh level, duplicate siblings, same names in different branches, rename identity, reorder, subtree move, cycle and depth conflicts, rollback, subtree deletion, unauthenticated access, and cross-Workspace / cross-project isolation.

## 4. Frontend data layer and project experience

- [x] 4.1 Add the approved `@dnd-kit` packages and consolidate Project / Node TypeScript types, API calls, query keys, mutations, cache invalidation, and user-facing error mapping around the existing API client.
- [x] 4.2 Replace the project-list placeholder with responsive desktop table and mobile list views backed by React Query, showing only project status, goal, node total, and update time available in this Change.
- [x] 4.3 Implement project-list loading, no-project, loading-failure/retry, and mutation states without treating failures as empty data or repeating writes automatically.
- [x] 4.4 Implement accessible create and edit project dialogs/forms with validation, four project statuses, disabled duplicate submission, preserved input on failure, and navigation into a newly created empty directory.
- [x] 4.5 Implement project deletion confirmation displaying the project name, conflict handling, cancellation, successful return to the project list, and removal of P1 import/archive controls from this flow.
- [x] 4.6 Add frontend project tests for normal, empty, loading, validation, submission, retry, status, deletion, and API error states on desktop and mobile rendering paths.

## 5. Responsive knowledge directory experience

- [x] 5.1 Build reusable flat-node indexing, ordered-tree, descendant, depth, and breadcrumb selectors keyed by stable Node IDs, with unit tests for malformed and valid server data.
- [x] 5.2 Replace the desktop project placeholder with the established global-navigation, 280px directory-tree, and content layout, including expand/collapse, selection, breadcrumb, empty directory, and empty node states.
- [x] 5.3 Implement node create, rename, description edit, and delete-subtree dialogs with limits, descendant counts, disabled duplicate submission, preserved input, stable conflict messages, and authoritative refresh after uncertain results.
- [x] 5.4 Implement desktop node reorder and cross-parent movement with clear drop targets through `@dnd-kit`, plus an equivalent keyboard-accessible “move to” menu that calls the same move mutation.
- [x] 5.5 Implement the missing mobile project-directory route and 390px drill-down experience with current-level lists, back/breadcrumb navigation, child creation, rename, description editing, and no drag handlers.
- [x] 5.6 Add frontend directory tests for three-level browsing, desktop selection, menu movement, drag mutation mapping, mobile drill-down, six-level and duplicate-name conflicts, subtree deletion, loading failure/retry, mutation failure, and non-overlapping 390px controls.

## 6. Integrated validation and closeout

- [x] 6.1 Seed or create the acceptance project “新房装修” with `硬装施工 / 水电`, `家具家电 / 大家电 / 冰箱`, and `预算与采购`, then manually verify create, rename, reorder, valid move, rejected duplicate/cycle/depth move, subtree deletion, project status, and project deletion.
- [x] 6.2 Verify desktop and 390px mobile behavior in a real browser, including no-project, empty-directory, empty-node, loading/failure simulations, mobile drill-down, desktop drag and menu movement, text fit, focus access, and absence of overlapping controls.
- [x] 6.3 Run `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .` and resolve all failures.
- [x] 6.4 Run `cd frontend && npm test -- --run && npm run lint && npm run build` and resolve all failures.
- [x] 6.5 Run `openspec validate --all --strict`, review the implemented behavior against both delta specs and explicit Non-goals, and resolve every validation issue.
- [x] 6.6 Sync the completed `project-management` and `knowledge-directory` delta specs into the main specs, update routed product context only if implementation changed a confirmed decision, then archive the Change and verify no required artifact or task remains incomplete.
