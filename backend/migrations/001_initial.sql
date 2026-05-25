CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    raw_merchant TEXT,
    amount REAL NOT NULL,
    source TEXT NOT NULL,
    plaid_account_id TEXT,
    synced_to_sheets BOOLEAN DEFAULT 0,
    sheets_retry_count INTEGER DEFAULT 0,
    sheets_last_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_state (
    account_id TEXT PRIMARY KEY,
    cursor TEXT NOT NULL,
    last_synced_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    priority INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    gross_pay REAL NOT NULL,
    taxes REAL NOT NULL,
    pre_tax_deductions REAL NOT NULL,
    post_tax_deductions REAL NOT NULL,
    net_pay REAL NOT NULL,
    information TEXT,
    synced_to_sheets BOOLEAN DEFAULT 0,
    sheets_retry_count INTEGER DEFAULT 0,
    sheets_last_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_group TEXT NOT NULL,
    account_name TEXT NOT NULL,
    current_amount REAL NOT NULL,
    total_dividends REAL DEFAULT 0,
    apy REAL DEFAULT 0,
    total_interest REAL DEFAULT 0,
    fee REAL DEFAULT 0,
    notes TEXT,
    last_updated DATE NOT NULL,
    synced_to_sheets BOOLEAN DEFAULT 0,
    sheets_retry_count INTEGER DEFAULT 0,
    sheets_last_retry_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    amount REAL NOT NULL,
    day_of_month INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
