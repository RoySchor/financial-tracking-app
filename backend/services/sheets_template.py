import re
from database import get_db
from services.sheets_client import get_spreadsheet

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

    _replace_table_references(new_sheet, TEMPLATE_TABLE_NAME, new_table_name)
    _populate_recurring_rows(new_sheet, month, year)

    return True


def _replace_table_references(worksheet, old_name: str, new_name: str):
    all_formulas = worksheet.get(value_render_option="FORMULA")
    updates = []

    for row_idx, row in enumerate(all_formulas, start=1):
        for col_idx, cell in enumerate(row, start=1):
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
            row_text = " ".join(row).lower()
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
        row_text = " ".join(row).lower()
        if label.lower() in row_text:
            template.update_cell(row_idx, TEMPLATE_AMOUNT_COL, amount)
            return True

    return False


def gspread_cell_label(row: int, col: int) -> str:
    letters = ""
    while col > 0:
        col, remainder = divmod(col - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row}"
