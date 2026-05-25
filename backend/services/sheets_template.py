import logging

from database import get_db
from services.sheets_client import get_spreadsheet

logger = logging.getLogger(__name__)

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

TEMPLATE_SHEET_NAME = "_Expenses Template"
TEMPLATE_TABLE_NAME = "Expenses_Month_Year"


def ensure_month_sheet_exists(month: int, year: int, spreadsheet=None) -> bool:
    if spreadsheet is None:
        spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return False

    month_name = MONTH_NAMES[month - 1]
    sheet_title = f"Expenses {month_name} {year}"
    new_table_name = f"Expenses_{month_name}_{year}"

    existing = [ws.title for ws in spreadsheet.worksheets()]
    if sheet_title in existing:
        return True

    if TEMPLATE_SHEET_NAME not in existing:
        return False

    template = spreadsheet.worksheet(TEMPLATE_SHEET_NAME)
    new_sheet = spreadsheet.duplicate_sheet(
        template.id,
        new_sheet_name=sheet_title,
    )

    _replace_placeholders(new_sheet, month_name, year)
    _replace_table_references(new_sheet, TEMPLATE_TABLE_NAME, new_table_name)
    _rename_table(spreadsheet, new_sheet, TEMPLATE_TABLE_NAME, new_table_name)
    _populate_recurring_rows(new_sheet, month, year)

    return True


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


def _rename_table(spreadsheet, worksheet, old_table_name: str, new_table_name: str):
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
                    table_range = table.get("range", {})
                    spreadsheet.batch_update({
                        "requests": [{
                            "updateTable": {
                                "table": {
                                    "name": new_table_name,
                                    "range": table_range,
                                    "columns": table.get("columns", []),
                                },
                                "fields": "name",
                            }
                        }]
                    })
                    return
    except Exception as e:
        logger.warning(f"Table rename failed ({old_table_name} -> {new_table_name}): {e}")


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
