# CLAUDE.md

## Project Overview

Personal finance tracker. Syncs credit card transactions and investment holdings/transactions from Plaid, stores in SQLite, displays via React dashboard, and dual-writes expenses/income/assets to Google Sheets.

## Commands

```bash
make dev              # Start backend + frontend together
make backend          # FastAPI on 127.0.0.1:8000
make frontend         # Vite dev server on :5173
make sync             # Trigger Plaid sync via curl
make seed-categories  # Load config/categories.json into DB
make db-migrate       # Run pending SQL migrations
make db-reset         # Drop and recreate DB (destructive)
```

## Project Structure

- `backend/` — Python FastAPI app
  - `main.py` — App entry, CORS, lifespan, router registration
  - `database.py` — SQLite connection (`get_db()` context manager), migration runner
  - `models.py` — Pydantic request/response models
  - `migrations/` — Numbered SQL files (e.g. `001_initial.sql`)
  - `routers/` — One file per resource (transactions, income, assets, recurring, categories, investments, accounts, sync, status)
  - `services/` — Business logic (Plaid sync, investment sync, Sheets writing, category mapping)
- `frontend/` — React + TypeScript + Vite + Tailwind
  - `src/api/client.ts` — API client with typed methods
  - `src/pages/` — One component per page
- `config/categories.json` — Merchant-to-category mapping rules
- `data/` — SQLite database (gitignored)

## Key Patterns

**Database access**: Always use `with get_db() as conn:` — never call `get_connection()` directly. The context manager ensures cleanup on exceptions.

**Google Sheets auth**: No singleton/caching. `get_spreadsheet()` does fresh auth each call to avoid 1-hour token expiry. For batch operations, call `get_spreadsheet()` once and pass the instance through as a parameter.

**Sheets writes are fire-and-forget from the caller's perspective**: Router handlers call `write_*_to_sheets()` after the DB write succeeds. If Sheets fails, it marks the row for retry — the API response still succeeds. Never let a Sheets failure roll back a DB write.

**Retry with exponential backoff**: Failed Sheets writes track `sheets_retry_count` and `sheets_last_retry_at`. Backoff schedule: 1min, 5min, 30min, 2hr, max 5 attempts.

**SQL table references in dynamic queries**: Always validate against `VALID_TABLES` whitelist before interpolating table names.

**Falsy-safe checks**: Use `x if x is not None else default` not `x or default` — fields like `day_of_month=0` or `amount=0.0` are valid falsy values.

**Investment sync**: Holdings are snapshot-based (DELETE + INSERT per account per sync). Investment transactions use INSERT OR IGNORE with Plaid's transaction ID as PK for natural deduplication. Plaid API calls must happen OUTSIDE `with get_db()` blocks to avoid holding SQLite open during HTTP calls.

**Token safety in logging**: Never use `logger.exception()` or log `str(e)` for Plaid-related exceptions — `ApiException.body` can contain access tokens. Always log only `type(e).__name__`.

**Frontend error handling**: Every page has `error` state, try/catch around API calls, and a red banner with Retry button.

**TypeScript imports**: Project uses `verbatimModuleSyntax` — type-only imports must use `import type { X }` separate from value imports.

## Migrations

Add new migrations as `backend/migrations/NNN_description.sql`. They run automatically on app startup via the lifespan handler. The `schema_version` table tracks which have been applied.

## Security Constraints

- **This is a personal finance tracking app. Never include actual financial data (transactions, balances, account info, database files) in any commit. Ensure all financial data paths remain gitignored.**
- `.env` contains Plaid tokens — **never commit, never log, never include in error messages**. Plaid tokens are irreplaceable (burning one loses the Item permanently).
- Uvicorn binds to `127.0.0.1` only — financial data must not be network-accessible.
- The sync endpoint error response must not include `str(e)` — exception details could contain tokens. Return only the exception type to the client.
- Never use `logger.exception()` for Plaid-related errors — tracebacks include `ApiException.body` which may contain access tokens. Use `logger.error(f"...: {type(e).__name__}")` instead.
- Service account credential files are gitignored via `**/service-account*.json` and `**/credentials*.json`.
- `.gitignore` must exclude: `.env`, `data/`, `*.db`.

## Environment

Requires `.env` at project root (see `.env.example`). Key vars:
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ACCESS_TOKEN_*` — Plaid auth
- `GOOGLE_SHEETS_CREDENTIALS` — path to service account JSON
- `GOOGLE_SHEETS_SPREADSHEET_ID` — target spreadsheet
- `DB_PATH` — defaults to `./data/finance.db`

## Testing

No test suite currently. Verify changes by:
1. `make dev` and exercise the UI
2. Check Python syntax: `.venv/bin/python -c "import py_compile; py_compile.compile('backend/file.py', doraise=True)"`
3. Check TypeScript: `cd frontend && npx tsc --noEmit`
