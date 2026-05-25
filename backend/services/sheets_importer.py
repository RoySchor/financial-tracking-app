import logging
import re
import time
import uuid
from datetime import date

from database import get_db
from services.sheets_client import get_spreadsheet

logger = logging.getLogger(__name__)

INCOME_SHEET_PATTERN = re.compile(r"^(\d{4}) Income Breakdown$")
EXPENSES_SHEET_PATTERN = re.compile(r"^Expenses (\w+) (\d{4})$")
ASSET_SHEET_TITLE = "Rough Asset Portfolio"
READ_DELAY_SECONDS = 2

MONTH_NAME_TO_NUM = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_currency(val: str) -> float:
    if not val or not val.strip():
        return 0.0
    cleaned = val.strip().replace("$", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_percentage(val: str) -> float:
    if not val or not val.strip():
        return 0.0
    cleaned = val.strip().replace("%", "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_date_mdy(val: str) -> str | None:
    if not val or not val.strip():
        return None
    parts = val.strip().split("/")
    if len(parts) != 3:
        return None
    try:
        month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
        return f"{year:04d}-{month:02d}-{day:02d}"
    except ValueError:
        return None


def import_income_from_sheets() -> dict:
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return {"error": "Sheets not configured", "imported": 0}

    all_sheets = [ws.title for ws in spreadsheet.worksheets()]
    income_sheets = []
    for title in all_sheets:
        m = INCOME_SHEET_PATTERN.match(title)
        if m:
            income_sheets.append((int(m.group(1)), title))

    income_sheets.sort()
    total_imported = 0
    total_skipped = 0

    with get_db() as conn:
        for year, sheet_title in income_sheets:
            worksheet = spreadsheet.worksheet(sheet_title)
            time.sleep(READ_DELAY_SECONDS)
            all_values = worksheet.get_all_values()

            header_row_idx = None
            for idx, row in enumerate(all_values):
                if len(row) >= 7 and "date" in row[0].lower() and "type" in row[1].lower():
                    header_row_idx = idx
                    break

            if header_row_idx is None:
                logger.warning(f"No header row found in {sheet_title}")
                continue

            data_rows = all_values[header_row_idx + 1:]

            for row in data_rows:
                if len(row) < 7:
                    continue

                date_iso = _parse_date_mdy(row[0])
                if not date_iso:
                    continue

                income_type = row[1].strip()
                if not income_type:
                    continue

                gross_pay = _parse_currency(row[2])
                taxes = _parse_currency(row[3])
                pre_tax = _parse_currency(row[4])
                post_tax = _parse_currency(row[5])
                net_pay = _parse_currency(row[6])
                information = row[8].strip() if len(row) > 8 else ""

                existing = conn.execute(
                    "SELECT id FROM income WHERE date = ? AND type = ? AND gross_pay = ?",
                    (date_iso, income_type, gross_pay),
                ).fetchone()

                if existing:
                    total_skipped += 1
                    continue

                conn.execute(
                    """INSERT INTO income (date, type, gross_pay, taxes, pre_tax_deductions,
                       post_tax_deductions, net_pay, information, synced_to_sheets)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                    (date_iso, income_type, gross_pay, taxes, pre_tax, post_tax, net_pay, information),
                )
                total_imported += 1

        conn.commit()

    return {"imported": total_imported, "skipped": total_skipped, "sheets_read": len(income_sheets)}


def import_expenses_from_sheets() -> dict:
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return {"error": "Sheets not configured", "imported": 0}

    all_sheets = [ws.title for ws in spreadsheet.worksheets()]
    expense_sheets = []
    for title in all_sheets:
        m = EXPENSES_SHEET_PATTERN.match(title)
        if m:
            month_name = m.group(1).lower()
            year = int(m.group(2))
            month_num = MONTH_NAME_TO_NUM.get(month_name)
            if month_num:
                expense_sheets.append((year, month_num, title))

    expense_sheets.sort()
    total_imported = 0
    total_skipped = 0

    with get_db() as conn:
        for year, month_num, sheet_title in expense_sheets:
            worksheet = spreadsheet.worksheet(sheet_title)
            time.sleep(READ_DELAY_SECONDS)
            all_values = worksheet.get_all_values()

            header_row_idx = None
            for idx, row in enumerate(all_values):
                if len(row) >= 3 and "date" in row[0].lower() and "type" in row[1].lower() and "amount" in row[2].lower():
                    header_row_idx = idx
                    break

            if header_row_idx is None:
                logger.warning(f"No header row found in {sheet_title}")
                continue

            data_rows = all_values[header_row_idx + 1:]

            for row in data_rows:
                if len(row) < 3:
                    continue

                date_iso = _parse_date_mdy(row[0])
                if not date_iso:
                    continue

                expense_type = row[1].strip()
                if not expense_type:
                    continue

                amount = _parse_currency(row[2])
                if amount == 0.0:
                    continue

                # Dedup by date+type+amount+source. Two identical purchases on the same day
                # will only import the first one — acceptable tradeoff vs. creating duplicates on re-run.
                existing = conn.execute(
                    "SELECT id FROM transactions WHERE date = ? AND type = ? AND amount = ? AND source = 'sheets_import'",
                    (date_iso, expense_type, amount),
                ).fetchone()

                if existing:
                    total_skipped += 1
                    continue

                txn_id = str(uuid.uuid4())
                conn.execute(
                    """INSERT INTO transactions (id, date, type, raw_merchant, amount, source, synced_to_sheets)
                       VALUES (?, ?, ?, ?, ?, 'sheets_import', 1)""",
                    (txn_id, date_iso, expense_type, expense_type, amount),
                )
                total_imported += 1

        conn.commit()

    return {"imported": total_imported, "skipped": total_skipped, "sheets_read": len(expense_sheets)}


def import_assets_from_sheets() -> dict:
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return {"error": "Sheets not configured", "imported": 0}

    existing_sheets = [ws.title for ws in spreadsheet.worksheets()]
    if ASSET_SHEET_TITLE not in existing_sheets:
        return {"error": f"Sheet '{ASSET_SHEET_TITLE}' not found", "imported": 0}

    worksheet = spreadsheet.worksheet(ASSET_SHEET_TITLE)
    time.sleep(READ_DELAY_SECONDS)
    all_values = worksheet.get_all_values()

    header_row_idx = None
    for idx, row in enumerate(all_values):
        if len(row) >= 3 and "bank" in row[0].lower() and "account" in row[1].lower():
            header_row_idx = idx
            break

    if header_row_idx is None:
        return {"error": "No header row found in Rough Asset Portfolio", "imported": 0}

    data_rows = all_values[header_row_idx + 1:]
    today = date.today().isoformat()
    total_imported = 0
    total_updated = 0

    with get_db() as conn:
        for row in data_rows:
            if len(row) < 3:
                continue

            bank_group = row[0].strip()
            account_name = row[1].strip()
            if not bank_group or not account_name:
                continue

            current_amount = _parse_currency(row[2]) if len(row) > 2 else 0.0
            total_dividends = _parse_currency(row[3]) if len(row) > 3 else 0.0
            apy = _parse_percentage(row[4]) if len(row) > 4 else 0.0
            total_interest = _parse_currency(row[5]) if len(row) > 5 else 0.0
            fee = _parse_percentage(row[6]) if len(row) > 6 else 0.0
            notes = row[7].strip() if len(row) > 7 else ""

            existing = conn.execute(
                "SELECT id FROM assets WHERE bank_group = ? AND account_name = ?",
                (bank_group, account_name),
            ).fetchone()

            if existing:
                conn.execute(
                    """UPDATE assets SET current_amount = ?, total_dividends = ?, apy = ?,
                       total_interest = ?, fee = ?, notes = ?, last_updated = ?,
                       synced_to_sheets = 1
                       WHERE id = ?""",
                    (current_amount, total_dividends, apy, total_interest, fee, notes, today, existing["id"]),
                )
                total_updated += 1
            else:
                conn.execute(
                    """INSERT INTO assets (bank_group, account_name, current_amount,
                       total_dividends, apy, total_interest, fee, notes, last_updated, synced_to_sheets)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                    (bank_group, account_name, current_amount, total_dividends, apy,
                     total_interest, fee, notes, today),
                )
                total_imported += 1

        conn.commit()

    return {"imported": total_imported, "updated": total_updated}
