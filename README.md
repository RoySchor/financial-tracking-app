# My Finances

I used to have a Google Sheet that I manually updated to track my financial spending, savings, and tax situation. Needless to say it was quite manual.

I made this to automate that tracking. It syncs credit card transactions via Plaid, stores them locally in SQLite, serves a React dashboard, and dual-writes everything to an existing Finance tracking Google Sheets.

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
- **Plaid**: Transaction sync with cursor-based pagination and historical backfill
- **Google Sheets**: Dual-write with to keep sheet in sync

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
| `PLAID_ACCESS_TOKEN_*` | Yes | One per institution (e.g. `_CHASE`, `_CAPITALONE`) |
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

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | Sync status, DB size, failed writes |
| POST | `/api/sync` | Trigger Plaid transaction sync |
| GET | `/api/transactions?month=&year=` | List transactions for a month |
| GET | `/api/transactions/summary?month=&year=` | Category breakdown |
| GET | `/api/transactions/yearly?year=` | Monthly totals for the year |
| POST | `/api/transactions/cash` | Add a manual cash expense |
| GET | `/api/categories` | List category mappings |
| PUT | `/api/categories/{id}` | Update a category mapping |
| GET | `/api/recurring` | List recurring expenses |
| PUT | `/api/recurring/{id}` | Update a recurring expense |
| GET | `/api/income` | List income entries |
| POST | `/api/income` | Add income entry |
| GET | `/api/assets` | List assets |
| POST | `/api/assets` | Add/update an asset |
| POST | `/api/sheets/retry` | Retry failed Sheets writes |

## Google Sheets Integration

When configured, the app dual-writes to Google Sheets:

> This is hardcoded to my own Google Sheets Template design

## Security Notes

- **Financial data never enters the Git repo.** The `.gitignore` excludes `.env`, `data/`, and `*.db`.
- **Uvicorn binds to 127.0.0.1 only** — the API is not accessible from the network.
