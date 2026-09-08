import logging
import time
from datetime import datetime, timezone

from database import get_db
from services.sheets_client import get_spreadsheet, is_quota_error
from services.sheets_template import get_month_worksheet
from services.trips_sheets import sync_trips_for_period

logger = logging.getLogger(__name__)

BACKOFF_MINUTES = [1, 5, 30, 120]
MAX_RETRIES = 5
MAX_RETRY_BATCH = 20
RETRY_DELAY_SECONDS = 3
VALID_TABLES = {"transactions", "income", "assets", "trips"}


def write_transaction_to_sheets(transaction: dict, spreadsheet=None) -> bool:
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    with get_db() as conn:
        current = conn.execute(
            "SELECT synced_to_sheets FROM transactions WHERE id = ?",
            (transaction["id"],),
        ).fetchone()
        if current and current["synced_to_sheets"] == 1:
            return True

    try:
        date_str = transaction["date"]
        parts = date_str.split("-")
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])

        worksheet = get_month_worksheet(month, year, spreadsheet=spreadsheet)
        if worksheet is None:
            _mark_retry_failed(transaction["id"], "transactions")
            return False

        formatted_date = f"{month}/{day}/{year}"
        row = [
            formatted_date,
            transaction["type"],
            transaction["amount"],
        ]

        col_a = worksheet.col_values(1)
        next_row = len(col_a) + 1
        for i in range(len(col_a) - 1, -1, -1):
            if col_a[i].strip():
                next_row = i + 2
                break
        worksheet.update(f"A{next_row}:C{next_row}", [row], value_input_option="USER_ENTERED")

        with get_db() as conn:
            conn.execute(
                "UPDATE transactions SET synced_to_sheets = 1 WHERE id = ?",
                (transaction["id"],),
            )
            conn.commit()

        return True
    except Exception as e:
        logger.warning(f"Sheets write failed for transaction {transaction.get('id')}: {e}")
        _mark_retry_failed(transaction["id"], "transactions", count_attempt=not is_quota_error(e))
        return False


def write_income_to_sheets(income: dict, spreadsheet=None) -> bool:
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    with get_db() as conn:
        current = conn.execute(
            "SELECT synced_to_sheets FROM income WHERE id = ?",
            (income["id"],),
        ).fetchone()
        if current and current["synced_to_sheets"] == 1:
            return True

    try:
        date_str = income["date"]
        parts = date_str.split("-")
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])

        sheet_title = f"{year} Income Breakdown"

        existing = [ws.title for ws in spreadsheet.worksheets()]
        if sheet_title not in existing:
            spreadsheet.add_worksheet(title=sheet_title, rows=100, cols=10)

        worksheet = spreadsheet.worksheet(sheet_title)

        formatted_date = f"{month}/{day}/{year}"
        row = [
            formatted_date,
            income["type"],
            income["gross_pay"],
            income["taxes"],
            income["pre_tax_deductions"],
            income["post_tax_deductions"],
            income["net_pay"],
            "",
            income.get("information") or "",
        ]

        col_a = worksheet.col_values(1)
        next_row = len(col_a) + 1
        for i in range(len(col_a) - 1, -1, -1):
            if col_a[i].strip():
                next_row = i + 2
                break
        worksheet.update(f"A{next_row}:I{next_row}", [row], value_input_option="USER_ENTERED")

        with get_db() as conn:
            conn.execute(
                "UPDATE income SET synced_to_sheets = 1 WHERE id = ?",
                (income["id"],),
            )
            conn.commit()

        return True
    except Exception as e:
        logger.warning(f"Sheets write failed for income {income.get('id')}: {e}")
        _mark_retry_failed(income["id"], "income", count_attempt=not is_quota_error(e))
        return False


def write_asset_to_sheets(asset: dict, spreadsheet=None) -> bool:
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    with get_db() as conn:
        current = conn.execute(
            "SELECT synced_to_sheets FROM assets WHERE id = ?",
            (asset["id"],),
        ).fetchone()
        if current and current["synced_to_sheets"] == 1:
            return True

    try:
        sheet_title = "Rough Asset Portfolio"

        existing = [ws.title for ws in spreadsheet.worksheets()]
        if sheet_title not in existing:
            worksheet = spreadsheet.add_worksheet(title=sheet_title, rows=100, cols=10)
            worksheet.update("A3:H3", [["Bank / Holding Group", "Account Name", "Current Amount",
                            "Total Dividends Received", "APY", "Total Interest Earned",
                            "Fee", "Notes"]], value_input_option="USER_ENTERED")
        else:
            worksheet = spreadsheet.worksheet(sheet_title)

        new_row = [
            asset["bank_group"],
            asset["account_name"],
            asset["current_amount"],
            asset["total_dividends"],
            asset["apy"],
            asset["total_interest"],
            asset["fee"],
            asset.get("notes") or "",
        ]

        # Upsert: find existing row by bank_group + account_name
        all_values = worksheet.get_all_values()
        updated = False
        for row_idx, row in enumerate(all_values, start=1):
            if len(row) >= 2 and row[0] == asset["bank_group"] and row[1] == asset["account_name"]:
                cell_range = f"A{row_idx}:H{row_idx}"
                worksheet.update(cell_range, [new_row], value_input_option="USER_ENTERED")
                updated = True
                break

        if not updated:
            col_a = worksheet.col_values(1)
            next_row = len(col_a) + 1
            for i in range(len(col_a) - 1, -1, -1):
                if col_a[i].strip():
                    next_row = i + 2
                    break
            worksheet.update(f"A{next_row}:H{next_row}", [new_row], value_input_option="USER_ENTERED")

        with get_db() as conn:
            conn.execute(
                "UPDATE assets SET synced_to_sheets = 1 WHERE id = ?",
                (asset["id"],),
            )
            conn.commit()

        return True
    except Exception as e:
        logger.warning(f"Sheets write failed for asset {asset.get('id')}: {e}")
        _mark_retry_failed(asset["id"], "assets", count_attempt=not is_quota_error(e))
        return False


def retry_failed_writes() -> dict:
    now = datetime.now(timezone.utc)
    retried = 0
    succeeded = 0
    total_writes = 0

    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return {"retried": 0, "succeeded": 0, "error": "Sheets not configured"}

    with get_db() as conn:
        failed_txns = conn.execute(
            """SELECT * FROM transactions
               WHERE synced_to_sheets = 0 AND sheets_retry_count < ?
               ORDER BY date ASC""",
            (MAX_RETRIES,),
        ).fetchall()

        for row in failed_txns:
            if total_writes >= MAX_RETRY_BATCH:
                break
            txn = dict(row)
            if not _should_retry(txn, now):
                continue
            retried += 1
            if write_transaction_to_sheets(txn, spreadsheet=spreadsheet):
                succeeded += 1
            total_writes += 1
            time.sleep(RETRY_DELAY_SECONDS)

        if total_writes < MAX_RETRY_BATCH:
            failed_income = conn.execute(
                """SELECT * FROM income
                   WHERE synced_to_sheets = 0 AND sheets_retry_count < ?""",
                (MAX_RETRIES,),
            ).fetchall()

            for row in failed_income:
                if total_writes >= MAX_RETRY_BATCH:
                    break
                entry = dict(row)
                if not _should_retry(entry, now):
                    continue
                retried += 1
                if write_income_to_sheets(entry, spreadsheet=spreadsheet):
                    succeeded += 1
                total_writes += 1
                time.sleep(RETRY_DELAY_SECONDS)

        if total_writes < MAX_RETRY_BATCH:
            failed_assets = conn.execute(
                """SELECT * FROM assets
                   WHERE synced_to_sheets = 0 AND sheets_retry_count < ?""",
                (MAX_RETRIES,),
            ).fetchall()

            for row in failed_assets:
                if total_writes >= MAX_RETRY_BATCH:
                    break
                asset = dict(row)
                if not _should_retry(asset, now):
                    continue
                retried += 1
                if write_asset_to_sheets(asset, spreadsheet=spreadsheet):
                    succeeded += 1
                total_writes += 1
                time.sleep(RETRY_DELAY_SECONDS)

        if total_writes < MAX_RETRY_BATCH:
            failed_trips = conn.execute(
                """SELECT * FROM trips
                   WHERE synced_to_sheets = 0 AND sheets_retry_count < ?""",
                (MAX_RETRIES,),
            ).fetchall()

            # Trip writes rewrite a whole month block, so retry once per period
            # rather than once per trip.
            periods = []
            for row in failed_trips:
                trip = dict(row)
                if not _should_retry(trip, now):
                    continue
                period = (trip["sheet_month"], trip["sheet_year"])
                if period not in periods:
                    periods.append(period)

            for month, year in periods:
                if total_writes >= MAX_RETRY_BATCH:
                    break
                retried += 1
                if sync_trips_for_period(month, year, spreadsheet=spreadsheet):
                    succeeded += 1
                total_writes += 1
                time.sleep(RETRY_DELAY_SECONDS)

    return {"retried": retried, "succeeded": succeeded}


def _should_retry(row: dict, now: datetime) -> bool:
    retry_count = row.get("sheets_retry_count", 0)
    last_retry = row.get("sheets_last_retry_at")

    if retry_count >= MAX_RETRIES:
        return False

    if last_retry is None:
        return True

    if isinstance(last_retry, str):
        try:
            last_retry_dt = datetime.fromisoformat(last_retry)
        except ValueError:
            return True
    else:
        last_retry_dt = last_retry

    if last_retry_dt.tzinfo is None:
        last_retry_dt = last_retry_dt.replace(tzinfo=timezone.utc)

    # Quota deferrals advance the backoff but not the attempt budget, so a
    # rate-limited row still slows down instead of retrying every minute forever.
    attempts = retry_count + (row.get("sheets_quota_deferrals") or 0)
    backoff_idx = min(attempts, len(BACKOFF_MINUTES) - 1)
    wait_minutes = BACKOFF_MINUTES[backoff_idx]
    elapsed = (now - last_retry_dt).total_seconds() / 60

    return elapsed >= wait_minutes


def _mark_retry_failed(row_id, table: str, count_attempt: bool = True):
    """Record a failed Sheets write.

    A quota error is a property of how fast we called the API, not of the row, so
    it must not spend one of the MAX_RETRIES attempts — a burst of 429s would
    otherwise permanently strand perfectly valid rows. It still has to slow the
    row down, though, so it advances sheets_quota_deferrals, which feeds the
    backoff schedule alongside the attempt count. A row failing only on quota
    therefore backs off to the 2-hour ceiling and keeps trying rather than either
    hammering every minute or being abandoned.
    """
    if table not in VALID_TABLES:
        raise ValueError(f"Invalid table: {table}")
    now = datetime.now(timezone.utc).isoformat()
    if count_attempt:
        counters = "sheets_retry_count = sheets_retry_count + 1"
    else:
        counters = "sheets_quota_deferrals = sheets_quota_deferrals + 1"
    with get_db() as conn:
        conn.execute(
            f"""UPDATE {table}
                SET {counters},
                    sheets_last_retry_at = ?
                WHERE id = ?""",
            (now, row_id),
        )
        conn.commit()
