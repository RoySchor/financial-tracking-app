import os
from fastapi import APIRouter

from database import get_db, DB_PATH
from models import StatusOut
from services.sheets_writer import retry_failed_writes
from services.sheets_importer import import_income_from_sheets, import_assets_from_sheets, import_expenses_from_sheets

router = APIRouter(tags=["status"])


@router.get("/status", response_model=StatusOut)
def get_status():
    with get_db() as conn:
        last_sync = conn.execute(
            "SELECT MAX(last_synced_at) as ts FROM sync_state"
        ).fetchone()["ts"]

        total_txns = conn.execute(
            "SELECT COUNT(*) as c FROM transactions"
        ).fetchone()["c"]

        failed_sheets = conn.execute(
            """SELECT COUNT(*) as c FROM transactions
               WHERE synced_to_sheets = 0 AND sheets_retry_count >= 5"""
        ).fetchone()["c"]

        failed_sheets += conn.execute(
            """SELECT COUNT(*) as c FROM income
               WHERE synced_to_sheets = 0 AND sheets_retry_count >= 5"""
        ).fetchone()["c"]

    db_size = 0
    if os.path.exists(DB_PATH):
        db_size = round(os.path.getsize(DB_PATH) / (1024 * 1024), 2)

    return StatusOut(
        last_sync=last_sync,
        total_transactions=total_txns,
        failed_sheets_writes=failed_sheets,
        db_size_mb=db_size,
    )


@router.post("/sheets/retry")
def retry_failed_sheets():
    result = retry_failed_writes()
    return {"message": f"Retried {result['retried']}, succeeded {result['succeeded']}"}


@router.post("/import/income")
def import_income():
    result = import_income_from_sheets()
    if "error" in result:
        return {"error": result["error"]}
    return result


@router.post("/import/assets")
def import_assets():
    result = import_assets_from_sheets()
    if "error" in result:
        return {"error": result["error"]}
    return result


@router.post("/import/expenses")
def import_expenses():
    result = import_expenses_from_sheets()
    if "error" in result:
        return {"error": result["error"]}
    return result
