import calendar
import logging
import uuid

from database import get_db
from services.sheets_client import get_spreadsheet

logger = logging.getLogger(__name__)

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

TEMPLATE_SHEET_NAME = "_Expenses Template"
TEMPLATE_TABLE_NAME = "Expenses_Month_Year"


def get_month_worksheet(month: int, year: int, spreadsheet=None):
    """Return the worksheet for a month, creating it from the template if needed.

    Returns the worksheet so callers don't pay a second read to look it up again;
    None means the sheet is missing and could not be created.
    """
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return None

    month_name = MONTH_NAMES[month - 1]
    sheet_title = f"Expenses {month_name} {year}"
    new_table_name = f"Expenses_{month_name}_{year}"

    worksheets = spreadsheet.worksheets()
    by_title = {ws.title: ws for ws in worksheets}
    if sheet_title in by_title:
        return by_title[sheet_title]

    if TEMPLATE_SHEET_NAME not in by_title:
        return None

    template = by_title[TEMPLATE_SHEET_NAME]
    new_sheet = spreadsheet.duplicate_sheet(
        template.id,
        new_sheet_name=sheet_title,
    )

    _replace_placeholders(new_sheet, month_name, year)
    # Rename the table before rewriting formulas: the rewritten formulas reference
    # the new name, so a failed rename must not leave them pointing at nothing.
    if _rename_table(spreadsheet, new_sheet, TEMPLATE_TABLE_NAME, new_table_name):
        _replace_table_references(new_sheet, TEMPLATE_TABLE_NAME, new_table_name)
    _populate_recurring_rows(new_sheet, month, year)

    return new_sheet


def _replace_placeholders(worksheet, month_name: str, year: int):
    all_values = worksheet.get(value_render_option="FORMULA")
    updates = []

    for row_idx, row in enumerate(all_values, start=1):
        for col_idx, cell in enumerate(row, start=1):
            if not isinstance(cell, str):
                continue
            if "<Month>" not in cell and "<Year>" not in cell:
                continue
            new_val = cell.replace("<Month>", month_name).replace("<Year>", str(year))
            updates.append({
                "range": gspread_cell_label(row_idx, col_idx),
                "values": [[new_val]],
            })

    if updates:
        worksheet.batch_update(updates, value_input_option="USER_ENTERED")


def _rename_table(spreadsheet, worksheet, old_table_name: str, new_table_name: str) -> bool:
    """Rename the duplicated template's table. Returns True if the rename landed."""
    try:
        sheet_id = worksheet.id
        metadata = spreadsheet.fetch_sheet_metadata()
        sheets = metadata.get("sheets", [])

        for sheet in sheets:
            if sheet.get("properties", {}).get("sheetId") != sheet_id:
                continue
            for table in sheet.get("tables", []):
                current_name = table.get("name", "")
                if old_table_name in current_name:
                    spreadsheet.batch_update({
                        "requests": [{
                            "updateTable": {
                                # tableId identifies the target; "fields": "name"
                                # limits the update to the name. Sending range or
                                # column data here is both unnecessary and invalid.
                                "table": {
                                    "tableId": table.get("tableId"),
                                    "name": new_table_name,
                                },
                                "fields": "name",
                            }
                        }]
                    })
                    return True
        logger.warning(f"Table rename skipped: no table matching '{old_table_name}' found")
        return False
    except Exception as e:
        logger.error(
            f"Table rename failed ({old_table_name} -> {new_table_name}): {e}. "
            f"Formulas on this sheet were left pointing at the template table."
        )
        return False


def _replace_table_references(worksheet, old_name: str, new_name: str):
    all_formulas = worksheet.get(value_render_option="FORMULA")
    updates = []

    for row_idx, row in enumerate(all_formulas, start=1):
        for col_idx, cell in enumerate(row, start=1):
            if not isinstance(cell, str):
                continue
            if old_name in cell:
                new_val = cell.replace(old_name, new_name)
                updates.append({
                    "range": gspread_cell_label(row_idx, col_idx),
                    "values": [[new_val]],
                })

    if updates:
        worksheet.batch_update(updates, value_input_option="USER_ENTERED")


def _populate_recurring_rows(worksheet, month: int, year: int):
    month_name = MONTH_NAMES[month - 1]

    with get_db() as conn:
        recurring = conn.execute(
            "SELECT label, full_name, amount, day_of_month FROM recurring_expenses"
        ).fetchall()

    if not recurring:
        return

    all_values = worksheet.get_all_values()
    updates = []

    for expense in recurring:
        label = expense["label"]
        for row_idx, row in enumerate(all_values, start=1):
            row_text = " ".join(str(c) for c in row).lower()
            if label.lower() in row_text:
                for col_idx, cell in enumerate(row, start=1):
                    if "<Month>" in cell:
                        updates.append({
                            "range": gspread_cell_label(row_idx, col_idx),
                            "values": [[cell.replace("<Month>", month_name)]],
                        })

                # Set date in first column (assumes date is col A)
                day = expense["day_of_month"]
                date_str = f"{month}/{day}/{year}"
                updates.append({
                    "range": gspread_cell_label(row_idx, 1),
                    "values": [[date_str]],
                })
                break

    if updates:
        worksheet.batch_update(updates, value_input_option="USER_ENTERED")

    insert_recurring_transactions(month, year)


def insert_recurring_transactions(month: int, year: int):
    """Insert recurring expenses into the transactions table for a given month."""
    last_day = calendar.monthrange(year, month)[1]

    with get_db() as conn:
        recurring = conn.execute(
            "SELECT label, full_name, amount, day_of_month FROM recurring_expenses"
        ).fetchall()

        for expense in recurring:
            if not expense["amount"] or expense["amount"] <= 0:
                continue
            day = min(expense["day_of_month"], last_day)
            date_str = f"{year}-{month:02d}-{day:02d}"
            existing = conn.execute(
                """SELECT id FROM transactions
                   WHERE date = ? AND type = ? AND source = 'recurring'""",
                (date_str, expense["full_name"]),
            ).fetchone()
            if existing:
                continue
            conn.execute(
                """INSERT INTO transactions (id, date, type, amount, source, synced_to_sheets)
                   VALUES (?, ?, ?, ?, 'recurring', 1)""",
                (str(uuid.uuid4()), date_str, expense["full_name"], expense["amount"]),
            )
        conn.commit()


TEMPLATE_AMOUNT_COL = 3  # Column C — amount column in the expenses template


TEMPLATE_TYPE_COL = 2  # Column B — type/label column in the expenses template
TEMPLATE_DATA_START_ROW = 3  # Data starts at row 3 (row 1 = title, row 2 = headers)


def update_template_recurring(label: str, amount: float, full_name: str | None = None):
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    existing = [ws.title for ws in spreadsheet.worksheets()]
    if TEMPLATE_SHEET_NAME not in existing:
        return False

    template = spreadsheet.worksheet(TEMPLATE_SHEET_NAME)
    all_values = template.get_all_values()

    for row_idx, row in enumerate(all_values, start=1):
        if row_idx < TEMPLATE_DATA_START_ROW:
            continue
        if len(row) < TEMPLATE_TYPE_COL:
            continue
        cell_value = row[TEMPLATE_TYPE_COL - 1].strip().lower()
        if cell_value == label.lower() or (full_name and cell_value == full_name.lower()):
            template.update_cell(row_idx, TEMPLATE_AMOUNT_COL, amount)
            return True

    return False


def gspread_cell_label(row: int, col: int) -> str:
    letters = ""
    while col > 0:
        col, remainder = divmod(col - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row}"
