# KnowStruct Repository Instructions

## Default Context Loading

- Start with this file, `openspec/config.yaml`, and `docs/项目上下文与文档路由.md`.
- Read the relevant main specs under `openspec/specs/` before changing existing behavior.
- Do not read the three long product documents end to end by default. Use the routing table in `docs/项目上下文与文档路由.md` and open only the sections related to the current change.
- Read `openspec/changes/archive/` only when historical rationale is needed. Archived changes are not the current behavior source of truth.
- If sources conflict, surface the conflict. For implemented behavior, main specs take precedence; for future scope and unresolved product decisions, the detailed baseline remains authoritative.

## Product Guardrails

- Keep work inside the current P0 vertical slice unless the user explicitly changes scope.
- AI output is always a candidate. It must not directly overwrite formal knowledge records.
- Keep Source, Processing Task, Extraction, Entry, and Decision as distinct concepts.
- Every formal Entry must remain traceable to its original Source.
- P0 uses an ordinary knowledge directory tree backed by MySQL; do not introduce a graph database.
- Mobile and desktop are one responsive Web app. Mobile prioritizes capture and lightweight confirmation; desktop prioritizes directory maintenance and batch organization.
- Do not add registration, password recovery, third-party login, collaboration, complex permissions, or other P1-P3 features unless a change explicitly includes them.

## OpenSpec Workflow

- Use one focused change per user-visible vertical slice.
- Explore first when boundaries, states, data ownership, risks, or acceptance criteria are unresolved.
- Before proposing, state the user problem, appetite, included behavior, non-goals, core flow, affected objects, failure states, and acceptance data.
- Treat `openspec/specs/` as the current implemented capability baseline.
- Keep proposal, design, specs, and tasks coherent when a decision changes.
- Apply tasks until complete or genuinely blocked, then validate, sync specs, archive, and commit.
- Do not create a new change merely to record implementation details already covered by a main spec.

## Engineering Baseline

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4.
- Backend: FastAPI, Pydantic v2, async SQLAlchemy 2, Alembic.
- Database: MySQL 8.0+; SQLite is allowed only for fast isolated tests.
- Production: Nginx on ECS, RDS MySQL, OSS for files, replaceable AI providers.
- Preserve existing module boundaries and add migrations for persistent schema changes.
- Scope all business data to the authenticated user's workspace.
- Never commit `.env`, credentials, raw session tokens, or plaintext passwords.

## Validation

- Backend: `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
- Frontend: `cd frontend && npm test -- --run && npm run lint && npm run build`
- OpenSpec: `openspec validate --all --strict`
- Use a disposable MySQL database ending in `_test` for destructive database tests.
- For user-facing responsive changes, verify desktop and 390px mobile behavior in a browser.
