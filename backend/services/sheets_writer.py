import logging
from datetime import datetime, timezone

from database import get_db
from services.sheets_client import get_spreadsheet
from services.sheets_template import ensure_month_sheet_exists, MONTH_NAMES

logger = logging.getLogger(__name__)

BACKOFF_MINUTES = [1, 5, 30, 120]
MAX_RETRIES = 5
VALID_TABLES = {"transactions", "income", "assets"}


def write_transaction_to_sheets(transaction: dict, spreadsheet=None) -> bool:
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    try:
        date_str = transaction["date"]
        parts = date_str.split("-")
        month = int(parts[1])
        year = int(parts[0])

        if not ensure_month_sheet_exists(month, year, spreadsheet=spreadsheet):
            _mark_retry_failed(transaction["id"], "transactions")
            return False

        month_name = MONTH_NAMES[month - 1]
        sheet_title = f"Expenses {month_name} {year}"
        worksheet = spreadsheet.worksheet(sheet_title)

        row = [
            transaction["date"],
            transaction["type"],
            transaction["amount"],
            transaction.get("raw_merchant", ""),
            transaction.get("source", ""),
        ]
        worksheet.append_row(row, value_input_option="USER_ENTERED")

        with get_db() as conn:
            conn.execute(
                "UPDATE transactions SET synced_to_sheets = 1 WHERE id = ?",
                (transaction["id"],),
            )
            conn.commit()

        return True
    except Exception as e:
        logger.warning(f"Sheets write failed for transaction {transaction.get('id')}: {e}")
        _mark_retry_failed(transaction["id"], "transactions")
        return False


def write_income_to_sheets(income: dict) -> bool:
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    try:
        year = int(income["date"].split("-")[0])
        sheet_title = f"{year} Income Breakdown"

        existing = [ws.title for ws in spreadsheet.worksheets()]
        if sheet_title not in existing:
            spreadsheet.add_worksheet(title=sheet_title, rows=100, cols=10)

        worksheet = spreadsheet.worksheet(sheet_title)

        row = [
            income["date"],
            income["type"],
            income["gross_pay"],
            income["taxes"],
            income["pre_tax_deductions"],
            income["post_tax_deductions"],
            income["net_pay"],
            income.get("information") or "",
        ]
        worksheet.append_row(row, value_input_option="USER_ENTERED")

        with get_db() as conn:
            conn.execute(
                "UPDATE income SET synced_to_sheets = 1 WHERE id = ?",
                (income["id"],),
            )
            conn.commit()

        return True
    except Exception as e:
        logger.warning(f"Sheets write failed for income {income.get('id')}: {e}")
        _mark_retry_failed(income["id"], "income")
        return False


def write_asset_to_sheets(asset: dict) -> bool:
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    try:
        sheet_title = "Asset Portfolio"

        existing = [ws.title for ws in spreadsheet.worksheets()]
        if sheet_title not in existing:
            worksheet = spreadsheet.add_worksheet(title=sheet_title, rows=100, cols=10)
            worksheet.append_row(
                ["Bank/Group", "Account Name", "Current Amount", "Total Dividends",
                 "APY", "Total Interest", "Fee", "Notes", "Last Updated"],
                value_input_option="USER_ENTERED",
            )
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
            asset["last_updated"],
        ]

        # Upsert: find existing row by bank_group + account_name
        all_values = worksheet.get_all_values()
        updated = False
        for row_idx, row in enumerate(all_values[1:], start=2):  # skip header
            if len(row) >= 2 and row[0] == asset["bank_group"] and row[1] == asset["account_name"]:
                cell_range = f"A{row_idx}:I{row_idx}"
                worksheet.update(cell_range, [new_row], value_input_option="USER_ENTERED")
                updated = True
                break

        if not updated:
            worksheet.append_row(new_row, value_input_option="USER_ENTERED")

        with get_db() as conn:
            conn.execute(
                "UPDATE assets SET synced_to_sheets = 1 WHERE id = ?",
                (asset["id"],),
            )
            conn.commit()

        return True
    except Exception as e:
        logger.warning(f"Sheets write failed for asset {asset.get('id')}: {e}")
        _mark_retry_failed(asset["id"], "assets")
        return False


def retry_failed_writes() -> dict:
    now = datetime.now(timezone.utc)
    retried = 0
    succeeded = 0

    with get_db() as conn:
        # Retry transactions
        failed_txns = conn.execute(
            """SELECT * FROM transactions
               WHERE synced_to_sheets = 0 AND sheets_retry_count < ?""",
            (MAX_RETRIES,),
        ).fetchall()

        for row in failed_txns:
            txn = dict(row)
            if not _should_retry(txn, now):
                continue
            retried += 1
            if write_transaction_to_sheets(txn):
                succeeded += 1

        # Retry income
        failed_income = conn.execute(
            """SELECT * FROM income
               WHERE synced_to_sheets = 0 AND sheets_retry_count < ?""",
            (MAX_RETRIES,),
        ).fetchall()

        for row in failed_income:
            entry = dict(row)
            if not _should_retry(entry, now):
                continue
            retried += 1
            if write_income_to_sheets(entry):
                succeeded += 1

        # Retry assets
        failed_assets = conn.execute(
            """SELECT * FROM assets
               WHERE synced_to_sheets = 0 AND sheets_retry_count < ?""",
            (MAX_RETRIES,),
        ).fetchall()

        for row in failed_assets:
            asset = dict(row)
            if not _should_retry(asset, now):
                continue
            retried += 1
            if write_asset_to_sheets(asset):
                succeeded += 1

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

    backoff_idx = min(retry_count, len(BACKOFF_MINUTES) - 1)
    wait_minutes = BACKOFF_MINUTES[backoff_idx]
    elapsed = (now - last_retry_dt).total_seconds() / 60

    return elapsed >= wait_minutes


def _mark_retry_failed(row_id, table: str):
    if table not in VALID_TABLES:
        raise ValueError(f"Invalid table: {table}")
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            f"""UPDATE {table}
                SET sheets_retry_count = sheets_retry_count + 1,
                    sheets_last_retry_at = ?
                WHERE id = ?""",
            (now, row_id),
        )
        conn.commit()
