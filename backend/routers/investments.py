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
        plaid_accounts = conn.execute(
            """SELECT h.plaid_account_id,
                      COALESCE(pa.display_name, pa.official_name) as account_name,
                      pa.institution,
                      pa.is_liquid,
                      SUM(h.institution_value) as total_value
               FROM holdings h
               LEFT JOIN plaid_accounts pa ON h.plaid_account_id = pa.plaid_account_id
               GROUP BY h.plaid_account_id
               ORDER BY total_value DESC""",
        ).fetchall()

        manual_accounts = conn.execute(
            "SELECT id, bank_group, account_name, current_amount, last_updated, is_liquid FROM assets ORDER BY current_amount DESC"
        ).fetchall()

        by_type = conn.execute(
            """SELECT s.type as asset_type, SUM(h.institution_value) as total_value
               FROM holdings h
               JOIN securities s ON h.security_id = s.security_id
               GROUP BY s.type
               ORDER BY total_value DESC""",
        ).fetchall()

        plaid_total = conn.execute(
            "SELECT COALESCE(SUM(institution_value), 0) as total FROM holdings"
        ).fetchone()["total"]

        manual_total = conn.execute(
            "SELECT COALESCE(SUM(current_amount), 0) as total FROM assets"
        ).fetchone()["total"]

        as_of = conn.execute(
            "SELECT MAX(as_of_date) as latest FROM holdings"
        ).fetchone()["latest"]

    by_account = []
    liquid_total = 0.0
    for r in plaid_accounts:
        value = r["total_value"]
        if r["is_liquid"]:
            liquid_total += value
        by_account.append({
            "id": f"plaid_{r['plaid_account_id']}",
            "plaid_account_id": r["plaid_account_id"],
            "asset_id": None,
            "account_name": r["account_name"],
            "institution": r["institution"],
            "total_value": value,
            "source": "plaid",
            "last_updated": None,
        })
    for r in manual_accounts:
        value = r["current_amount"]
        if r["is_liquid"]:
            liquid_total += value
        by_account.append({
            "id": f"manual_{r['id']}",
            "plaid_account_id": None,
            "asset_id": r["id"],
            "account_name": r["account_name"],
            "institution": r["bank_group"],
            "total_value": value,
            "source": "manual",
            "last_updated": r["last_updated"],
        })

    by_account.sort(key=lambda x: (x["institution"] or "", -x["total_value"]))

    type_list = [dict(r) for r in by_type]
    if manual_total > 0:
        merged = False
        for t in type_list:
            if t["asset_type"] and t["asset_type"].lower() == "cash":
                t["total_value"] += manual_total
                merged = True
                break
        if not merged:
            type_list.append({"asset_type": "cash", "total_value": manual_total})

    return {
        "total_value": plaid_total + manual_total,
        "liquid_total": liquid_total,
        "as_of_date": as_of,
        "by_account": by_account,
        "by_type": type_list,
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
