from fastapi import APIRouter, HTTPException

from database import get_db
from models import RecurringExpenseOut, RecurringExpenseIn
from services.sheets_template import update_template_recurring

router = APIRouter(tags=["recurring"])


@router.get("/recurring", response_model=list[RecurringExpenseOut])
def list_recurring():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM recurring_expenses ORDER BY day_of_month").fetchall()
    return [dict(r) for r in rows]


@router.put("/recurring/{expense_id}", response_model=RecurringExpenseOut)
def update_recurring(expense_id: int, update: RecurringExpenseIn):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM recurring_expenses WHERE id = ?", (expense_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Recurring expense not found")

        full_name = update.full_name if update.full_name is not None else existing["full_name"]
        day_of_month = update.day_of_month if update.day_of_month is not None else existing["day_of_month"]

        conn.execute(
            """UPDATE recurring_expenses
               SET amount = ?, full_name = ?, day_of_month = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (update.amount, full_name, day_of_month, expense_id),
        )
        conn.commit()

        row = conn.execute("SELECT * FROM recurring_expenses WHERE id = ?", (expense_id,)).fetchone()

    result = dict(row)
    update_template_recurring(result["label"], result["amount"], result["full_name"])
    return result
