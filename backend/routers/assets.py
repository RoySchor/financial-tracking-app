from fastapi import APIRouter
from datetime import date as date_type

from database import get_db
from models import AssetOut, AssetIn
from services.sheets_writer import write_asset_to_sheets

router = APIRouter(tags=["assets"])


@router.get("/assets", response_model=list[AssetOut])
def list_assets():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM assets ORDER BY bank_group, account_name").fetchall()
    return [dict(r) for r in rows]


@router.post("/assets", response_model=AssetOut)
def upsert_asset(entry: AssetIn):
    today = date_type.today().isoformat()

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM assets WHERE bank_group = ? AND account_name = ?",
            (entry.bank_group, entry.account_name),
        ).fetchone()

        if existing:
            conn.execute(
                """UPDATE assets SET current_amount = ?, total_dividends = ?, apy = ?,
                   total_interest = ?, fee = ?, notes = ?, last_updated = ?,
                   synced_to_sheets = 0
                   WHERE id = ?""",
                (
                    entry.current_amount, entry.total_dividends, entry.apy,
                    entry.total_interest, entry.fee, entry.notes, today,
                    existing["id"],
                ),
            )
            row_id = existing["id"]
        else:
            cursor = conn.execute(
                """INSERT INTO assets (bank_group, account_name, current_amount,
                   total_dividends, apy, total_interest, fee, notes, last_updated)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    entry.bank_group, entry.account_name, entry.current_amount,
                    entry.total_dividends, entry.apy, entry.total_interest,
                    entry.fee, entry.notes, today,
                ),
            )
            row_id = cursor.lastrowid

        conn.commit()
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (row_id,)).fetchone()
    result = dict(row)
    write_asset_to_sheets(result)
    return result
