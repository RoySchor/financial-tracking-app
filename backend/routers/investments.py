import re

from fastapi import APIRouter, HTTPException, Query

from database import get_db

router = APIRouter(tags=["investments"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(val: str, name: str):
    if not _DATE_RE.match(val):
        raise HTTPException(status_code=400, detail=f"{name} must be YYYY-MM-DD format")


@router.get("/investments/holdings")
def get_holdings(account_id: str | None = Query(None)):
    with get_db() as conn:
        if account_id:
            rows = conn.execute(
                """SELECT h.*, s.ticker, s.name as security_name, s.type as security_type,
                          s.close_price_as_of
                   FROM holdings h
                   JOIN securities s ON h.security_id = s.security_id
                   WHERE h.plaid_account_id = ?
                   ORDER BY h.institution_value DESC""",
                (account_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT h.*, s.ticker, s.name as security_name, s.type as security_type,
                          s.close_price_as_of,
                          COALESCE(pa.display_name, pa.official_name) as account_name,
                          pa.institution
                   FROM holdings h
                   JOIN securities s ON h.security_id = s.security_id
                   LEFT JOIN plaid_accounts pa ON h.plaid_account_id = pa.plaid_account_id
                   ORDER BY h.institution_value DESC""",
            ).fetchall()
    return [dict(r) for r in rows]


@router.get("/investments/summary")
def investment_summary():
    with get_db() as conn:
        by_account = conn.execute(
            """SELECT h.plaid_account_id,
                      COALESCE(pa.display_name, pa.official_name) as account_name,
                      pa.institution,
                      SUM(h.institution_value) as total_value
               FROM holdings h
               LEFT JOIN plaid_accounts pa ON h.plaid_account_id = pa.plaid_account_id
               GROUP BY h.plaid_account_id
               ORDER BY total_value DESC""",
        ).fetchall()

        by_type = conn.execute(
            """SELECT s.type as asset_type, SUM(h.institution_value) as total_value
               FROM holdings h
               JOIN securities s ON h.security_id = s.security_id
               GROUP BY s.type
               ORDER BY total_value DESC""",
        ).fetchall()

        total = conn.execute(
            "SELECT COALESCE(SUM(institution_value), 0) as total FROM holdings"
        ).fetchone()["total"]

        as_of = conn.execute(
            "SELECT MAX(as_of_date) as latest FROM holdings"
        ).fetchone()["latest"]

    return {
        "total_value": total,
        "as_of_date": as_of,
        "by_account": [dict(r) for r in by_account],
        "by_type": [dict(r) for r in by_type],
    }


@router.get("/investments/history")
def portfolio_history(months: int = Query(12)):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT ps.date,
                      SUM(ps.total_value) as total_value
               FROM portfolio_snapshots ps
               WHERE ps.date >= date('now', '-' || ? || ' months')
               GROUP BY ps.date
               ORDER BY ps.date""",
            (months,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/investments/transactions")
def investment_transactions(
    start: str = Query(...),
    end: str = Query(...),
    account_id: str | None = Query(None),
    type: str | None = Query(None),
):
    _validate_date(start, "start")
    _validate_date(end, "end")

    query = """SELECT it.*, s.ticker, s.name as security_name,
                      COALESCE(pa.display_name, pa.official_name) as account_name
               FROM investment_transactions it
               LEFT JOIN securities s ON it.security_id = s.security_id
               LEFT JOIN plaid_accounts pa ON it.plaid_account_id = pa.plaid_account_id
               WHERE it.date >= ? AND it.date <= ?"""
    params: list = [start, end]

    if account_id:
        query += " AND it.plaid_account_id = ?"
        params.append(account_id)
    if type:
        query += " AND it.type = ?"
        params.append(type)

    query += " ORDER BY it.date DESC"

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]
