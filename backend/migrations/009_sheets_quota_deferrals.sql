-- Separate "we were rate limited" from "this row failed".
--
-- sheets_retry_count serves two roles: it spends the MAX_RETRIES budget AND it
-- indexes BACKOFF_MINUTES. Not incrementing it on a 429 (so quota errors can't
-- strand a valid row) therefore also froze the backoff at its first step, so a
-- rate-limited row retried every minute indefinitely — hammering Sheets exactly
-- when it asked us to slow down.
--
-- This column advances the backoff on quota errors without touching the attempt
-- budget, letting the two escalate independently.
ALTER TABLE transactions ADD COLUMN sheets_quota_deferrals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE income ADD COLUMN sheets_quota_deferrals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN sheets_quota_deferrals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trips ADD COLUMN sheets_quota_deferrals INTEGER NOT NULL DEFAULT 0;
