CREATE TABLE IF NOT EXISTS plaid_accounts (
    plaid_account_id TEXT PRIMARY KEY,
    official_name TEXT,
    display_name TEXT,
    institution TEXT,
    account_mask TEXT,
    account_type TEXT,
    last_synced_at TIMESTAMP
);
