# My Finances

I used to have a Google Sheet that I manually updated to track my financial spending, savings, and tax situation. Needless to say it was quite manual.

I made this to automate that tracking. It syncs credit card transactions and investment holdings via Plaid, stores them locally in SQLite, serves a React dashboard, and dual-writes expenses/income/assets to an existing Finance tracking Google Sheets.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  React SPA  │────▶│  FastAPI     │────▶│  SQLite (WAL)   │
│  (Vite)     │◀────│  Backend     │     │  data/finance.db│
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
              ┌─────▼─────┐ ┌─────▼──────────┐
              │  Plaid API │ │ Google Sheets  │
              │  (sync)    │ │ (dual-write)   │
              └────────────┘ └────────────────┘
```

- **Backend**: Python FastAPI on port 8000 (bound to 127.0.0.1)
- **Frontend**: React + TypeScript + Vite on port 5173
- **Database**: SQLite with WAL mode, auto-migrating schema
- **Plaid**: Transaction sync (cursor-based pagination) + investment holdings/transactions
- **Google Sheets**: Dual-write to keep expense/income/asset sheets in sync

## Prerequisites

- Python 3.11+
- Node.js 18+
- A [Plaid](https://plaid.com) account with access tokens for your institutions
- A Google Cloud service account with Sheets API access (optional, for dual-write)

## Setup

```bash
# Clone and enter the project
cd my-finances

# Create venv, install deps, run migrations
make setup

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLAID_CLIENT_ID` | Yes | From Plaid Dashboard |
| `PLAID_SECRET` | Yes | From Plaid Dashboard |
| `PLAID_ACCESS_TOKEN_*` | Yes | One per institution |
| `GOOGLE_SHEETS_CREDENTIALS` | No | Path to service account JSON |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | No | Target spreadsheet ID |
| `DB_PATH` | No | Defaults to `./data/finance.db` |

## Running

```bash
# Start both backend and frontend
make dev

# Or run separately
make backend   # FastAPI on http://127.0.0.1:8000
make frontend  # Vite on http://localhost:5173
```

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make setup` | Create venv, install deps, run migrations |
| `make dev` | Start backend + frontend together |
| `make backend` | Start FastAPI server only |
| `make frontend` | Start Vite dev server only |
| `make sync` | Trigger a Plaid transaction sync |
| `make seed-categories` | Load category mappings from `config/categories.json` |
| `make db-migrate` | Run pending database migrations |
| `make db-reset` | Delete database and re-run migrations (destructive) |
| `make mark-synced` | Mark all DB rows as already synced to Google Sheets (use on new machines) |

## API

Full endpoint reference in [`openapi.yaml`](./openapi.yaml). FastAPI also serves interactive docs at [localhost:8000/docs](http://127.0.0.1:8000/docs) when the backend is running.

## Initial Data Import (New Machine Setup)

After cloning, setting up `.env`, and running `make setup && make dev`, use these commands to populate the database from your existing Google Sheets data and Plaid:

```bash
# 1. Sync transactions from Plaid (gets ~90 days of history)
curl -X POST http://127.0.0.1:8000/api/sync

# 2. Import historical expenses from all "Expenses <Month> <Year>" sheets
#    Pulls Date/Type/Amount from each sheet's table. Idempotent — safe to re-run.
curl -X POST http://127.0.0.1:8000/api/import/expenses

# 3. Import income from all "<Year> Income Breakdown" sheets
#    Reads Date, Type, Gross Pay, Taxes, Deductions, Net Pay, Information.
curl -X POST http://127.0.0.1:8000/api/import/income

# 4. Import assets from the "Rough Asset Portfolio" sheet
#    Reads Bank/Group, Account Name, Current Amount, Dividends, APY, Interest, Fee, Notes.
curl -X POST http://127.0.0.1:8000/api/import/assets

# 5. Load category mappings (merchant → category rules)
make seed-categories

# 6. Mark all data as already synced to Sheets (prevents duplicate writes)
#    Use this if your Google Sheet already has the data from another machine.
make mark-synced

# OR if this is the first machine and Sheets is empty, push data to Sheets:
# curl -X POST http://127.0.0.1:8000/api/sheets/retry
```

All import endpoints are idempotent — they skip rows that already exist in the DB. Imported data is marked `synced_to_sheets = 1` since it came from Sheets in the first place.

Note: Plaid only provides ~90 days of transaction history from most institutions. The expenses import fills in everything older from my manual Sheets entries.

## Investment Tracking

The app syncs holdings and transactions from investment accounts (Schwab, Betterment, Wealthfront, etc.) via Plaid's Investments product.

- **Holdings** are snapshot-based — each sync replaces the previous state for that account
- **Investment transactions** (buys, sells, dividends, fees) are append-only and deduplicated by Plaid's transaction ID
- **Portfolio snapshots** record daily total value per account for historical charting
- Investment data lives only in the local DB — it is **not** dual-written to Google Sheets

Investment accounts require separate Plaid Items with the `investments` product. Existing expense-only Items cannot retroactively gain new products. Tokens that don't support investments are cached and skipped on subsequent syncs.

## Google Sheets Integration

When configured, the app dual-writes to Google Sheets:

- **Expenses** → "Expenses {Month} {Year}" sheets (one per month, auto-created from template)
- **Income** → "{Year} Income Breakdown" sheets
- **Assets** → "Rough Asset Portfolio" sheet (upserts by bank + account name)

## Security Notes

- **Financial data never enters the Git repo.** The `.gitignore` excludes `.env`, `data/`, and `*.db`.
- **Uvicorn binds to 127.0.0.1 only** — the API is not accessible from the network.
