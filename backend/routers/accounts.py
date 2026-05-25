from fastapi import APIRouter, HTTPException

from database import get_db
from models import PlaidAccountOut, PlaidAccountUpdate

router = APIRouter()


@router.get("/accounts", response_model=list[PlaidAccountOut])
def list_accounts():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM plaid_accounts ORDER BY institution, official_name"
        ).fetchall()
    return [dict(r) for r in rows]


@router.put("/accounts/{plaid_account_id}", response_model=PlaidAccountOut)
def update_account(plaid_account_id: str, body: PlaidAccountUpdate):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM plaid_accounts WHERE plaid_account_id = ?",
            (plaid_account_id,),
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Account not found")

        conn.execute(
            "UPDATE plaid_accounts SET display_name = ? WHERE plaid_account_id = ?",
            (body.display_name, plaid_account_id),
        )
        conn.commit()

        updated = conn.execute(
            "SELECT * FROM plaid_accounts WHERE plaid_account_id = ?",
            (plaid_account_id,),
        ).fetchone()

    return dict(updated)
