CREATE TABLE IF NOT EXISTS securities (
    security_id TEXT PRIMARY KEY,
    ticker TEXT,
    name TEXT,
    type TEXT,
    close_price REAL,
    close_price_as_of TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
    plaid_account_id TEXT NOT NULL,
    security_id TEXT NOT NULL,
    quantity REAL,
    cost_basis REAL,
    institution_value REAL,
    institution_price REAL,
    as_of_date TEXT NOT NULL,
    PRIMARY KEY (plaid_account_id, security_id),
    FOREIGN KEY (plaid_account_id) REFERENCES plaid_accounts(plaid_account_id),
    FOREIGN KEY (security_id) REFERENCES securities(security_id)
);

CREATE TABLE IF NOT EXISTS investment_transactions (
    plaid_investment_transaction_id TEXT PRIMARY KEY,
    plaid_account_id TEXT NOT NULL,
    security_id TEXT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT,
    quantity REAL,
    price REAL,
    amount REAL,
    name TEXT,
    FOREIGN KEY (plaid_account_id) REFERENCES plaid_accounts(plaid_account_id)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    plaid_account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    total_value REAL NOT NULL,
    PRIMARY KEY (plaid_account_id, date)
);
