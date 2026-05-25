-- Mark transactions on or before 2026-04-14 as already synced (manual entries exist in Sheets).
-- Only transactions after this date will be pushed to Sheets going forward.
UPDATE transactions
SET synced_to_sheets = 1
WHERE date <= '2026-04-14';

-- Reset inflated retry counts from failed initial backfill for remaining transactions.
UPDATE transactions
SET sheets_retry_count = 0, sheets_last_retry_at = NULL
WHERE synced_to_sheets = 0;

UPDATE income
SET sheets_retry_count = 0, sheets_last_retry_at = NULL
WHERE synced_to_sheets = 0;

UPDATE assets
SET sheets_retry_count = 0, sheets_last_retry_at = NULL
WHERE synced_to_sheets = 0;
