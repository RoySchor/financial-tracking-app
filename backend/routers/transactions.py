import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
import uuid

from database import get_db
from models import TransactionOut, CashExpenseIn
from services.sheets_writer import write_transaction_to_sheets

router = APIRouter(tags=["transactions"])

_CATEGORY_GROUPS: list[dict] | None = None


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", s.lower()).strip()


def _load_category_groups() -> list[dict]:
    global _CATEGORY_GROUPS
    if _CATEGORY_GROUPS is None:
        path = Path(__file__).resolve().parent.parent.parent / "config" / "category_groups.json"
        if path.exists():
            raw = json.loads(path.read_text())
        else:
            raw = []
        for group in raw:
            group["_patterns"] = [_normalize(p) for p in group["patterns"]]
            group["_excludes"] = [_normalize(e) for e in group.get("exclude", [])]
        _CATEGORY_GROUPS = raw
    return _CATEGORY_GROUPS


def _classify(type_value: str, groups: list[dict]) -> str:
    """Longest matching pattern wins — immune to group ordering."""
    norm = _normalize(type_value)
    best_label = "Other"
    best_len = 0
    for group in groups:
        if any(exc in norm for exc in group["_excludes"]):
            continue
        for np in group["_patterns"]:
            if np in norm and len(np) > best_len:
                best_label = group["label"]
                best_len = len(np)
    return best_label


def _group_transactions(rows: list[dict]) -> list[dict]:
    groups = _load_category_groups()
    buckets: dict[str, dict] = {}
    for group in groups:
        buckets[group["label"]] = {"label": group["label"], "total": 0.0, "count": 0, "items": []}
    buckets["Other"] = {"label": "Other", "total": 0.0, "count": 0, "items": []}

    item_map: dict[str, dict[str, float]] = {}

    for row in rows:
        label = _classify(row["type"], groups)
        buckets[label]["total"] += row["amount"]
        buckets[label]["count"] += row["count"]
        if label not in item_map:
            item_map[label] = {}
        item_map[label][row["type"]] = item_map[label].get(row["type"], 0) + row["amount"]

    result = []
    for label, bucket in buckets.items():
        if bucket["total"] <= 0:
            continue
        items = [{"type": t, "total": v} for t, v in sorted(item_map.get(label, {}).items(), key=lambda x: -x[1])]
        result.append({**bucket, "items": items})

    result.sort(key=lambda x: -x["total"])
    return result

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(val: str, name: str):
    if not _DATE_RE.match(val):
        raise HTTPException(status_code=400, detail=f"{name} must be YYYY-MM-DD format")


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(month: int = Query(...), year: int = Query(...)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT t.*, COALESCE(pa.display_name, pa.official_name) as account_name
               FROM transactions t
               LEFT JOIN plaid_accounts pa ON t.plaid_account_id = pa.plaid_account_id
               WHERE strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ?
               ORDER BY t.date DESC""",
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


@router.get("/transactions/grouped")
def grouped_totals(month: int = Query(...), year: int = Query(...)):
    month_str = f"{month:02d}"
    year_str = str(year)

    with get_db() as conn:
        rows = conn.execute(
            """SELECT type, SUM(amount) as amount, COUNT(*) as count FROM transactions
               WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
               GROUP BY type ORDER BY amount DESC""",
            (month_str, year_str),
        ).fetchall()

    return _group_transactions([dict(r) for r in rows])


@router.get("/transactions/range")
def transactions_by_range(start: str = Query(...), end: str = Query(...)):
    _validate_date(start, "start")
    _validate_date(end, "end")
    with get_db() as conn:
        rows = conn.execute(
            """SELECT t.*, COALESCE(pa.display_name, pa.official_name) as account_name
               FROM transactions t
               LEFT JOIN plaid_accounts pa ON t.plaid_account_id = pa.plaid_account_id
               WHERE t.date >= ? AND t.date <= ?
               ORDER BY t.date DESC""",
            (start, end),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/transactions/range/summary")
def range_summary(start: str = Query(...), end: str = Query(...)):
    _validate_date(start, "start")
    _validate_date(end, "end")
    with get_db() as conn:
        total = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) as total FROM transactions
               WHERE date >= ? AND date <= ?""",
            (start, end),
        ).fetchone()["total"]

        by_category = conn.execute(
            """SELECT type, SUM(amount) as total, COUNT(*) as count FROM transactions
               WHERE date >= ? AND date <= ?
               GROUP BY type ORDER BY total DESC""",
            (start, end),
        ).fetchall()

        by_month = conn.execute(
            """SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
               FROM transactions WHERE date >= ? AND date <= ?
               GROUP BY month ORDER BY month""",
            (start, end),
        ).fetchall()

    return {
        "total": total,
        "by_category": [dict(r) for r in by_category],
        "by_month": [dict(r) for r in by_month],
    }


@router.get("/transactions/range/grouped")
def range_grouped(start: str = Query(...), end: str = Query(...)):
    _validate_date(start, "start")
    _validate_date(end, "end")
    with get_db() as conn:
        rows = conn.execute(
            """SELECT type, SUM(amount) as amount, COUNT(*) as count FROM transactions
               WHERE date >= ? AND date <= ?
               GROUP BY type ORDER BY amount DESC""",
            (start, end),
        ).fetchall()
    return _group_transactions([dict(r) for r in rows])


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


@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: str):
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Transaction not found")
        conn.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        conn.commit()
    return {"deleted": True}


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
        row = conn.execute(
            """SELECT t.*, COALESCE(pa.display_name, pa.official_name) as account_name
               FROM transactions t
               LEFT JOIN plaid_accounts pa ON t.plaid_account_id = pa.plaid_account_id
               WHERE t.id = ?""",
            (txn_id,),
        ).fetchone()
    result = dict(row)
    write_transaction_to_sheets(result)
    return result
