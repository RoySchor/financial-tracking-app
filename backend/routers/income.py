from fastapi import APIRouter, Query

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
