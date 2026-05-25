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

        updates = []
        params = []
        if body.display_name is not None:
            updates.append("display_name = ?")
            params.append(body.display_name)
        if body.is_liquid is not None:
            updates.append("is_liquid = ?")
            params.append(int(body.is_liquid))

        if updates:
            params.append(plaid_account_id)
            conn.execute(
                f"UPDATE plaid_accounts SET {', '.join(updates)} WHERE plaid_account_id = ?",
                params,
            )
            conn.commit()

        updated = conn.execute(
            "SELECT * FROM plaid_accounts WHERE plaid_account_id = ?",
            (plaid_account_id,),
        ).fetchone()

    return dict(updated)
