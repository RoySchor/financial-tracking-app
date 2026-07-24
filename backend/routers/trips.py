import logging

from fastapi import APIRouter, HTTPException, Query

from database import get_db
from models import TripOut, TripDetailOut, TripCreate, TripUpdate, TripTransactionsIn
from services.trips_sheets import sync_trips_for_period

logger = logging.getLogger(__name__)
router = APIRouter(tags=["trips"])

# Sheet tabs are named "Expenses <Month> <Year>"; anything outside this range is
# a typo rather than a real period, and syncing it would create junk tabs.
MIN_SHEET_YEAR = 2000
MAX_SHEET_YEAR = 2100

_UPDATABLE_TRIP_FIELDS = ("name", "sheet_month", "sheet_year", "notes")


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


def _validate_period(month: int | None, year: int | None):
    if month is not None and not 1 <= month <= 12:
        raise HTTPException(status_code=400, detail="sheet_month must be 1-12")
    if year is not None and not MIN_SHEET_YEAR <= year <= MAX_SHEET_YEAR:
        raise HTTPException(
            status_code=400,
            detail=f"sheet_year must be {MIN_SHEET_YEAR}-{MAX_SHEET_YEAR}",
        )


def _fetch_trip(conn, trip_id: int) -> dict | None:
    row = conn.execute(
        f"{_TRIP_SELECT} WHERE tr.id = ? GROUP BY tr.id", (trip_id,)
    ).fetchone()
    return dict(row) if row else None


def _fetch_trip_transactions(conn, trip_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT t.*, COALESCE(pa.display_name, pa.official_name) AS account_name,
                  tt.trip_id AS trip_id, tr.name AS trip_name
           FROM trip_transactions tt
           JOIN transactions t ON t.id = tt.transaction_id
           JOIN trips tr ON tr.id = tt.trip_id
           LEFT JOIN plaid_accounts pa ON t.plaid_account_id = pa.plaid_account_id
           WHERE tt.trip_id = ?
           ORDER BY t.date ASC""",
        (trip_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _assert_transactions_exist(conn, transaction_ids: list[str]):
    for txn_id in transaction_ids:
        exists = conn.execute(
            "SELECT id FROM transactions WHERE id = ?", (txn_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail=f"Transaction not found: {txn_id}")


def _periods_owning(conn, transaction_ids: list[str]) -> list[tuple[int, int]]:
    """Sheet periods of the trips that currently own these transactions.

    Claiming a transaction for another trip lowers the previous owner's total, so
    the previous owner's sheet has to be rewritten too or it keeps a stale number.
    """
    if not transaction_ids:
        return []
    placeholders = ",".join("?" * len(transaction_ids))
    rows = conn.execute(
        f"""SELECT DISTINCT tr.sheet_month, tr.sheet_year
            FROM trip_transactions tt
            JOIN trips tr ON tr.id = tt.trip_id
            WHERE tt.transaction_id IN ({placeholders})""",
        transaction_ids,
    ).fetchall()
    return [(r["sheet_month"], r["sheet_year"]) for r in rows]


def _sync_periods(periods: list[tuple[int, int]]):
    """Push the trip block for each distinct period; Sheets failures never fail the request."""
    for month, year in dict.fromkeys(periods):
        try:
            sync_trips_for_period(month, year)
        except Exception as e:
            logger.warning(f"Trip sheet sync failed for {month}/{year}: {type(e).__name__}")


@router.get("/trips", response_model=list[TripOut])
def list_trips(
    month: int | None = Query(None),
    year: int | None = Query(None),
    limit: int | None = Query(None, ge=1, le=200),
):
    """Trips overlapping a month, by transaction date or by sheet assignment.

    A trip spanning June–July shows up under both months so its transactions stay
    reachable from whichever month the user is looking at.
    """
    with get_db() as conn:
        if month is None or year is None:
            rows = conn.execute(
                f"""{_TRIP_SELECT}
                    GROUP BY tr.id
                    ORDER BY start_date DESC, tr.name
                    LIMIT ?""",
                (limit if limit is not None else -1,),
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
                ORDER BY start_date DESC, tr.name
                LIMIT ?""",
            (month, year, f"{month:02d}", str(year), limit if limit is not None else -1),
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
    _validate_period(trip.sheet_month, trip.sheet_year)

    with get_db() as conn:
        # Validate before inserting so a bad id is a 404, not a raw FK IntegrityError.
        _assert_transactions_exist(conn, trip.transaction_ids)
        # Capture previous owners before reassigning away from them.
        periods = _periods_owning(conn, trip.transaction_ids)

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

    _sync_periods([*periods, (trip.sheet_month, trip.sheet_year)])
    return result


@router.put("/trips/{trip_id}", response_model=TripDetailOut)
def update_trip(trip_id: int, update: TripUpdate):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Trip not found")

        old_period = (existing["sheet_month"], existing["sheet_year"])

        # model_fields_set distinguishes "omitted" from "explicitly null" — COALESCE
        # cannot, which would make notes impossible to clear.
        provided = [f for f in _UPDATABLE_TRIP_FIELDS if f in update.model_fields_set]
        if not provided:
            raise HTTPException(status_code=400, detail="No fields to update")

        values = {f: getattr(update, f) for f in provided}

        if "name" in values:
            name = (values["name"] or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Trip name cannot be empty")
            values["name"] = name
        _validate_period(values.get("sheet_month"), values.get("sheet_year"))

        assignments = ", ".join(f"{f} = ?" for f in provided)
        conn.execute(
            f"""UPDATE trips SET {assignments},
                  synced_to_sheets = 0,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
            (*[values[f] for f in provided], trip_id),
        )
        conn.commit()

        result = _fetch_trip(conn, trip_id)
        result["transactions"] = _fetch_trip_transactions(conn, trip_id)

    # Reassigning the sheet month must also clear the trip from its old sheet.
    _sync_periods([old_period, (result["sheet_month"], result["sheet_year"])])
    return result


@router.delete("/trips/{trip_id}")
def delete_trip(trip_id: int):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Trip not found")
        period = (existing["sheet_month"], existing["sheet_year"])
        # trip_transactions rows cascade; the transactions themselves are untouched.
        conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
        conn.commit()

    _sync_periods([period])
    return {"deleted": True}


@router.post("/trips/{trip_id}/transactions", response_model=TripDetailOut)
def add_trip_transactions(trip_id: int, payload: TripTransactionsIn):
    with get_db() as conn:
        trip = conn.execute(
            "SELECT sheet_month, sheet_year FROM trips WHERE id = ?", (trip_id,)
        ).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

        _assert_transactions_exist(conn, payload.transaction_ids)
        # Capture previous owners before reassigning away from them.
        periods = _periods_owning(conn, payload.transaction_ids)

        for txn_id in payload.transaction_ids:
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

    _sync_periods([*periods, (trip["sheet_month"], trip["sheet_year"])])
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

    _sync_periods([(trip["sheet_month"], trip["sheet_year"])])
    return result
