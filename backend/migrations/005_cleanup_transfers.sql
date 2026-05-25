-- Delete all Plaid-sourced transactions and reset sync cursors.
-- The next sync re-fetches everything with the transfer/interest filter active.
-- Manual 'cash' transactions are preserved.
DELETE FROM transactions WHERE source = 'plaid';
DELETE FROM sync_state;
