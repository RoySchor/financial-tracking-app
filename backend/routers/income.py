from fastapi import APIRouter, HTTPException, Query

from database import get_db
from models import IncomeOut, IncomeIn
from services.sheets_writer import write_income_to_sheets

router = APIRouter(tags=["income"])


@router.get("/income", response_model=list[IncomeOut])
def list_income(year: int = Query(...)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM income
               WHERE strftime('%Y', date) = ?
               ORDER BY date DESC""",
            (str(year),),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/income", response_model=IncomeOut)
def add_income(entry: IncomeIn):
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO income (date, type, gross_pay, taxes, pre_tax_deductions,
               post_tax_deductions, net_pay, information)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                entry.date.isoformat(),
                entry.type,
                entry.gross_pay,
                entry.taxes,
                entry.pre_tax_deductions,
                entry.post_tax_deductions,
                entry.net_pay,
                entry.information,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM income WHERE id = ?", (cursor.lastrowid,)).fetchone()
    result = dict(row)
    write_income_to_sheets(result)
    return result


@router.put("/income/{income_id}", response_model=IncomeOut)
def update_income(income_id: int, entry: IncomeIn):
    """Edit an income entry.

    Deliberately does NOT reset synced_to_sheets: the row is already appended to the
    yearly Income Breakdown tab, and clearing the flag would make the retry job append
    a duplicate rather than edit the existing row. The sheet is corrected by hand —
    the UI says so.
    """
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM income WHERE id = ?", (income_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Income entry not found")

        conn.execute(
            """UPDATE income SET date = ?, type = ?, gross_pay = ?, taxes = ?,
               pre_tax_deductions = ?, post_tax_deductions = ?, net_pay = ?, information = ?
               WHERE id = ?""",
            (
                entry.date.isoformat(),
                entry.type,
                entry.gross_pay,
                entry.taxes,
                entry.pre_tax_deductions,
                entry.post_tax_deductions,
                entry.net_pay,
                entry.information,
                income_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM income WHERE id = ?", (income_id,)).fetchone()
    return dict(row)


@router.delete("/income/{income_id}")
def delete_income(income_id: int):
    """Delete an income entry. The sheet row, if already written, is removed by hand."""
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM income WHERE id = ?", (income_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Income entry not found")
        conn.execute("DELETE FROM income WHERE id = ?", (income_id,))
        conn.commit()
    return {"deleted": True}
