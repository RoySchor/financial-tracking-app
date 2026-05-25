from fastapi import APIRouter, HTTPException
from datetime import date as date_type

from database import get_db
from models import AssetOut, AssetIn, AssetQuickUpdate
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

        conn.execute(
            "INSERT OR REPLACE INTO portfolio_snapshots (asset_id, date, total_value) VALUES (?, ?, ?)",
            (row_id, today, entry.current_amount),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (row_id,)).fetchone()
    result = dict(row)
    write_asset_to_sheets(result)
    return result


@router.patch("/assets/{asset_id}/quick", response_model=AssetOut)
def quick_update_asset(asset_id: int, update: AssetQuickUpdate):
    today = date_type.today().isoformat()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Asset not found")
        notes = update.notes if update.notes is not None else existing["notes"]
        is_liquid = int(update.is_liquid) if update.is_liquid is not None else existing["is_liquid"]
        conn.execute(
            """UPDATE assets SET current_amount = ?, notes = ?, is_liquid = ?, last_updated = ?, synced_to_sheets = 0
               WHERE id = ?""",
            (update.current_amount, notes, is_liquid, today, asset_id),
        )
        conn.execute(
            "INSERT OR REPLACE INTO portfolio_snapshots (asset_id, date, total_value) VALUES (?, ?, ?)",
            (asset_id, today, update.current_amount),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    result = dict(row)
    write_asset_to_sheets(result)
    return result


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: int):
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Asset not found")
        conn.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        conn.commit()
    return {"deleted": True}
