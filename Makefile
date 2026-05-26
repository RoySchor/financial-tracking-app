PYTHON = .venv/bin/python

.PHONY: dev backend frontend sync seed-categories seed-assets db-reset db-migrate setup mark-synced dedup

setup:
	python3 -m venv .venv
	$(PYTHON) -m pip install -r requirements.txt
	cd frontend && npm install
	@make db-migrate
	@echo "Setup complete. Copy .env.example to .env and fill in credentials."

dev:
	@echo "Starting backend and frontend..."
	@make backend & make frontend & wait

backend:
	cd backend && ../$(PYTHON) -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

sync:
	@curl -s -X POST http://localhost:8000/api/sync | $(PYTHON) -m json.tool

seed-categories:
	@cd backend && ../$(PYTHON) seed_categories.py

seed-assets:
	@cd backend && ../$(PYTHON) seed_assets.py

db-migrate:
	@cd backend && ../$(PYTHON) -c "from database import run_migrations; run_migrations()"

db-reset:
	@echo "WARNING: This will delete all local data!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@rm -f data/finance.db
	@make db-migrate
	@echo "Database reset complete."

mark-synced:
	@echo "Marking all rows as already synced to Google Sheets..."
	@sqlite3 data/finance.db "\
		UPDATE transactions SET synced_to_sheets = 1, sheets_retry_count = 0; \
		UPDATE income SET synced_to_sheets = 1, sheets_retry_count = 0; \
		UPDATE assets SET synced_to_sheets = 1, sheets_retry_count = 0;"
	@echo "Done. All rows marked as synced — no Sheets writes will be attempted for existing data."

dedup:
	@cd backend && ../$(PYTHON) dedup_transactions.py

dedup-dry:
	@cd backend && ../$(PYTHON) dedup_transactions.py --dry-run
