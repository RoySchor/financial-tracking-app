-- Trips: group transactions (possibly spanning multiple months) under a named trip.
-- sheet_month/sheet_year decide which monthly Sheets tab the trip total is written to,
-- since a trip can span months but each tab covers one month.
CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sheet_month INTEGER NOT NULL,
    sheet_year INTEGER NOT NULL,
    notes TEXT,
    synced_to_sheets BOOLEAN DEFAULT 0,
    sheets_retry_count INTEGER DEFAULT 0,
    sheets_last_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- transaction_id is the PK, not a composite: a transaction belongs to at most one
-- trip, so trip totals can never double-count the same expense.
CREATE TABLE IF NOT EXISTS trip_transactions (
    transaction_id TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trip_transactions_trip ON trip_transactions(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_sheet_period ON trips(sheet_year, sheet_month);
