-- Restructure portfolio_snapshots to support manual account history.
-- A row is either Plaid-based (plaid_account_id set) or manual (asset_id set).
CREATE TABLE portfolio_snapshots_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plaid_account_id TEXT,
    asset_id INTEGER,
    date TEXT NOT NULL,
    total_value REAL NOT NULL,
    CHECK (plaid_account_id IS NOT NULL OR asset_id IS NOT NULL),
    CHECK (NOT (plaid_account_id IS NOT NULL AND asset_id IS NOT NULL)),
    UNIQUE(plaid_account_id, date),
    UNIQUE(asset_id, date),
    FOREIGN KEY (plaid_account_id) REFERENCES plaid_accounts(plaid_account_id),
    FOREIGN KEY (asset_id) REFERENCES assets(id)
);

INSERT INTO portfolio_snapshots_new (plaid_account_id, date, total_value)
SELECT plaid_account_id, date, total_value FROM portfolio_snapshots;

DROP TABLE portfolio_snapshots;
ALTER TABLE portfolio_snapshots_new RENAME TO portfolio_snapshots;
