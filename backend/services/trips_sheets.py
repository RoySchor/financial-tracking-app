"""Write trip name/total pairs into the monthly expenses sheet.

Layout: the expenses template reserves a two-column block for trips — the trip
name in column E and its total in column F, starting at row 10 (`Trip 1:` in the
template ships as the seed and is overwritten with the real name).

The whole block is rewritten on every sync rather than tracking a cell address
per trip. Storing addresses would silently drift the moment a row is inserted or
deleted in the sheet by hand, and deleting a trip would require rewriting the
rows below it anyway. A full rewrite makes renames, retotals, additions and
deletions all idempotent, and keeps the number of trips per month unbounded.
"""

import logging
from datetime import datetime, timezone

from database import get_db
from services.sheets_client import get_spreadsheet
from services.sheets_template import MONTH_NAMES, gspread_cell_label

logger = logging.getLogger(__name__)

# Block origin in the expenses template. Update these if the template moves the
# trips block; they are the only positional assumption trip syncing makes.
TRIP_BLOCK_START_ROW = 10
TRIP_LABEL_COL = 5  # Column E — trip name
TRIP_VALUE_COL = 6  # Column F — trip total

# Rows past the last trip that get blanked so deleted trips leave no stale entry.
TRIP_BLOCK_CLEAR_PADDING = 5


def sync_trips_for_period(month: int, year: int, spreadsheet=None) -> bool:
    """Rewrite the trip block on one month's sheet. Returns True on success."""
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    trips = _load_trips_for_period(month, year)

    try:
        month_name = MONTH_NAMES[month - 1]
        sheet_title = f"Expenses {month_name} {year}"

        existing = [ws.title for ws in spreadsheet.worksheets()]
        if sheet_title not in existing:
            logger.warning(f"Trip sync skipped: sheet '{sheet_title}' does not exist")
            return False

        worksheet = spreadsheet.worksheet(sheet_title)
        _write_trip_block(worksheet, trips)

        _mark_trips_synced([t["id"] for t in trips])
        return True
    except Exception as e:
        logger.warning(f"Trip Sheets sync failed for {month}/{year}: {e}")
        _mark_trips_failed([t["id"] for t in trips])
        return False


def _write_trip_block(worksheet, trips: list[dict]):
    """Write every trip into the block, then blank any rows left over."""
    previous_rows = _count_existing_block_rows(worksheet)

    updates = []
    for offset, trip in enumerate(trips):
        row = TRIP_BLOCK_START_ROW + offset
        updates.append({
            "range": gspread_cell_label(row, TRIP_LABEL_COL),
            "values": [[trip["name"]]],
        })
        updates.append({
            "range": gspread_cell_label(row, TRIP_VALUE_COL),
            "values": [[round(trip["total"], 2)]],
        })

    # Blank rows the block used to occupy so a removed trip doesn't linger.
    stale_end = max(previous_rows, len(trips) + TRIP_BLOCK_CLEAR_PADDING)
    for offset in range(len(trips), stale_end):
        row = TRIP_BLOCK_START_ROW + offset
        updates.append({"range": gspread_cell_label(row, TRIP_LABEL_COL), "values": [[""]]})
        updates.append({"range": gspread_cell_label(row, TRIP_VALUE_COL), "values": [[""]]})

    if updates:
        worksheet.batch_update(updates, value_input_option="USER_ENTERED")


def _count_existing_block_rows(worksheet) -> int:
    """How many contiguous rows the trip block currently occupies."""
    try:
        label_col = worksheet.col_values(TRIP_LABEL_COL)
    except Exception:
        return 0

    count = 0
    idx = TRIP_BLOCK_START_ROW - 1  # col_values is 0-indexed
    while idx < len(label_col) and label_col[idx].strip():
        count += 1
        idx += 1
    return count


def _load_trips_for_period(month: int, year: int) -> list[dict]:
    """Trips assigned to this month's sheet, with their full cross-month totals."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT tr.id, tr.name,
                      COALESCE(SUM(t.amount), 0) AS total,
                      MIN(t.date) AS start_date
               FROM trips tr
               LEFT JOIN trip_transactions tt ON tt.trip_id = tr.id
               LEFT JOIN transactions t ON t.id = tt.transaction_id
               WHERE tr.sheet_month = ? AND tr.sheet_year = ?
               GROUP BY tr.id
               ORDER BY COALESCE(MIN(t.date), '9999-12-31'), tr.name""",
            (month, year),
        ).fetchall()
    return [dict(r) for r in rows]


def _mark_trips_synced(trip_ids: list[int]):
    if not trip_ids:
        return
    placeholders = ",".join("?" * len(trip_ids))
    with get_db() as conn:
        conn.execute(
            f"UPDATE trips SET synced_to_sheets = 1 WHERE id IN ({placeholders})",
            trip_ids,
        )
        conn.commit()


def _mark_trips_failed(trip_ids: list[int]):
    if not trip_ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    placeholders = ",".join("?" * len(trip_ids))
    with get_db() as conn:
        conn.execute(
            f"""UPDATE trips
                SET synced_to_sheets = 0,
                    sheets_retry_count = sheets_retry_count + 1,
                    sheets_last_retry_at = ?
                WHERE id IN ({placeholders})""",
            [now, *trip_ids],
        )
        conn.commit()
