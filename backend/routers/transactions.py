from fastapi import APIRouter, Query
import uuid

from database import get_db
from models import TransactionOut, CashExpenseIn
from services.sheets_writer import write_transaction_to_sheets

router = APIRouter(tags=["transactions"])


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(month: int = Query(...), year: int = Query(...)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM transactions
               WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
               ORDER BY date DESC""",
            (f"{month:02d}", str(year)),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/transactions/summary")
def transaction_summary(month: int = Query(...), year: int = Query(...)):
    month_str = f"{month:02d}"
    year_str = str(year)

    with get_db() as conn:
        total = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) as total FROM transactions
               WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?""",
            (month_str, year_str),
        ).fetchone()["total"]

        top5 = conn.execute(
            """SELECT type, SUM(amount) as total FROM transactions
               WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
               GROUP BY type ORDER BY total DESC LIMIT 5""",
            (month_str, year_str),
        ).fetchall()

        by_category = conn.execute(
            """SELECT type, SUM(amount) as total, COUNT(*) as count FROM transactions
               WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
               GROUP BY type ORDER BY total DESC""",
            (month_str, year_str),
        ).fetchall()

    return {
        "total": total,
        "top5": [dict(r) for r in top5],
        "by_category": [dict(r) for r in by_category],
    }


@router.get("/transactions/yearly")
def yearly_totals(year: int = Query(...)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT strftime('%m', date) as month, SUM(amount) as total
               FROM transactions WHERE strftime('%Y', date) = ?
               GROUP BY month ORDER BY month""",
            (str(year),),
        ).fetchall()
    return [{"month": int(r["month"]), "total": r["total"]} for r in rows]


@router.post("/transactions/cash", response_model=TransactionOut)
def add_cash_expense(expense: CashExpenseIn):
    txn_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """INSERT INTO transactions (id, date, type, amount, source)
               VALUES (?, ?, ?, ?, 'cash')""",
            (txn_id, expense.date.isoformat(), expense.type, expense.amount),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    result = dict(row)
    write_transaction_to_sheets(result)
    return result
