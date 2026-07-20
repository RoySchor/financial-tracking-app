import logging

from fastapi import APIRouter, HTTPException, Query

from database import get_db
from models import TripOut, TripDetailOut, TripCreate, TripUpdate, TripTransactionsIn
from services.trips_sheets import sync_trips_for_period

logger = logging.getLogger(__name__)
router = APIRouter(tags=["trips"])


_TRIP_SELECT = """
    SELECT tr.id, tr.name, tr.sheet_month, tr.sheet_year, tr.notes, tr.synced_to_sheets,
           COALESCE(SUM(t.amount), 0) AS total,
           COUNT(t.id) AS transaction_count,
           MIN(t.date) AS start_date,
           MAX(t.date) AS end_date
    FROM trips tr
    LEFT JOIN trip_transactions tt ON tt.trip_id = tr.id
    LEFT JOIN transactions t ON t.id = tt.transaction_id
"""


def _fetch_trip(conn, trip_id: int) -> dict | None:
    row = conn.execute(
        f"{_TRIP_SELECT} WHERE tr.id = ? GROUP BY tr.id", (trip_id,)
    ).fetchone()
    return dict(row) if row else None


def _fetch_trip_transactions(conn, trip_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT t.*, COALESCE(pa.display_name, pa.official_name) AS account_name
           FROM trip_transactions tt
           JOIN transactions t ON t.id = tt.transaction_id
           LEFT JOIN plaid_accounts pa ON t.plaid_account_id = pa.plaid_account_id
           WHERE tt.trip_id = ?
           ORDER BY t.date ASC""",
        (trip_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _sync_period(month: int, year: int):
    """Push the trip block for a month; never let a Sheets failure fail the request."""
    try:
        sync_trips_for_period(month, year)
    except Exception as e:
        logger.warning(f"Trip sheet sync failed for {month}/{year}: {type(e).__name__}")


@router.get("/trips", response_model=list[TripOut])
def list_trips(month: int | None = Query(None), year: int | None = Query(None)):
    """Trips overlapping a month, by transaction date or by sheet assignment.

    A trip spanning June–July shows up under both months so its transactions stay
    reachable from whichever month the user is looking at.
    """
    with get_db() as conn:
        if month is None or year is None:
            rows = conn.execute(
                f"{_TRIP_SELECT} GROUP BY tr.id ORDER BY start_date DESC, tr.name"
            ).fetchall()
            return [dict(r) for r in rows]

        rows = conn.execute(
            f"""{_TRIP_SELECT}
                WHERE tr.id IN (
                    SELECT tr2.id FROM trips tr2
                    LEFT JOIN trip_transactions tt2 ON tt2.trip_id = tr2.id
                    LEFT JOIN transactions t2 ON t2.id = tt2.transaction_id
                    WHERE (tr2.sheet_month = ? AND tr2.sheet_year = ?)
                       OR (strftime('%m', t2.date) = ? AND strftime('%Y', t2.date) = ?)
                )
                GROUP BY tr.id
                ORDER BY start_date DESC, tr.name""",
            (month, year, f"{month:02d}", str(year)),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/trips/{trip_id}", response_model=TripDetailOut)
def get_trip(trip_id: int):
    with get_db() as conn:
        trip = _fetch_trip(conn, trip_id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        trip["transactions"] = _fetch_trip_transactions(conn, trip_id)
    return trip


@router.post("/trips", response_model=TripDetailOut)
def create_trip(trip: TripCreate):
    name = trip.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Trip name cannot be empty")
    if not 1 <= trip.sheet_month <= 12:
        raise HTTPException(status_code=400, detail="sheet_month must be 1-12")

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO trips (name, sheet_month, sheet_year, notes)
               VALUES (?, ?, ?, ?)""",
            (name, trip.sheet_month, trip.sheet_year, trip.notes),
        )
        trip_id = cursor.lastrowid

        for txn_id in trip.transaction_ids:
            conn.execute(
                """INSERT INTO trip_transactions (transaction_id, trip_id)
                   VALUES (?, ?)
                   ON CONFLICT(transaction_id) DO UPDATE SET trip_id = excluded.trip_id""",
                (txn_id, trip_id),
            )
        conn.commit()

        result = _fetch_trip(conn, trip_id)
        result["transactions"] = _fetch_trip_transactions(conn, trip_id)

    _sync_period(trip.sheet_month, trip.sheet_year)
    return result


@router.put("/trips/{trip_id}", response_model=TripDetailOut)
def update_trip(trip_id: int, update: TripUpdate):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Trip not found")

        old_month = existing["sheet_month"]
        old_year = existing["sheet_year"]

        name = update.name.strip() if update.name is not None else None
        if name is not None and not name:
            raise HTTPException(status_code=400, detail="Trip name cannot be empty")
        if update.sheet_month is not None and not 1 <= update.sheet_month <= 12:
            raise HTTPException(status_code=400, detail="sheet_month must be 1-12")

        # Falsy-safe: only overwrite fields the caller actually sent.
        conn.execute(
            """UPDATE trips SET
                 name = COALESCE(?, name),
                 sheet_month = COALESCE(?, sheet_month),
                 sheet_year = COALESCE(?, sheet_year),
                 notes = COALESCE(?, notes),
                 synced_to_sheets = 0,
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (name, update.sheet_month, update.sheet_year, update.notes, trip_id),
        )
        conn.commit()

        result = _fetch_trip(conn, trip_id)
        result["transactions"] = _fetch_trip_transactions(conn, trip_id)

    # Reassigning the sheet month must also clear the trip from its old sheet.
    if (old_month, old_year) != (result["sheet_month"], result["sheet_year"]):
        _sync_period(old_month, old_year)
    _sync_period(result["sheet_month"], result["sheet_year"])
    return result


@router.delete("/trips/{trip_id}")
def delete_trip(trip_id: int):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Trip not found")
        month, year = existing["sheet_month"], existing["sheet_year"]
        # trip_transactions rows cascade; the transactions themselves are untouched.
        conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
        conn.commit()

    _sync_period(month, year)
    return {"deleted": True}


@router.post("/trips/{trip_id}/transactions", response_model=TripDetailOut)
def add_trip_transactions(trip_id: int, payload: TripTransactionsIn):
    with get_db() as conn:
        trip = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

        for txn_id in payload.transaction_ids:
            exists = conn.execute(
                "SELECT id FROM transactions WHERE id = ?", (txn_id,)
            ).fetchone()
            if not exists:
                raise HTTPException(
                    status_code=404, detail=f"Transaction not found: {txn_id}"
                )
            # Moving a transaction between trips is a reassignment, not a duplicate.
            conn.execute(
                """INSERT INTO trip_transactions (transaction_id, trip_id)
                   VALUES (?, ?)
                   ON CONFLICT(transaction_id) DO UPDATE SET trip_id = excluded.trip_id""",
                (txn_id, trip_id),
            )
        conn.commit()

        result = _fetch_trip(conn, trip_id)
        result["transactions"] = _fetch_trip_transactions(conn, trip_id)

    _sync_period(trip["sheet_month"], trip["sheet_year"])
    return result


@router.delete("/trips/{trip_id}/transactions/{transaction_id}", response_model=TripDetailOut)
def remove_trip_transaction(trip_id: int, transaction_id: str):
    with get_db() as conn:
        trip = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

        cursor = conn.execute(
            "DELETE FROM trip_transactions WHERE trip_id = ? AND transaction_id = ?",
            (trip_id, transaction_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Transaction not in this trip")
        conn.commit()

        result = _fetch_trip(conn, trip_id)
        result["transactions"] = _fetch_trip_transactions(conn, trip_id)

    _sync_period(trip["sheet_month"], trip["sheet_year"])
    return result
