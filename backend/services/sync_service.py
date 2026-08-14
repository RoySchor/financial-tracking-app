import hashlib
import logging
import time
from datetime import datetime, timezone

from database import get_db
from services.plaid_client import get_plaid_client, get_access_tokens, get_accounts, sync_transactions, backfill_transactions
from services.category_mapper import load_mappings, map_category
from services.sheets_client import get_spreadsheet
from services.sheets_writer import write_transaction_to_sheets

logger = logging.getLogger(__name__)

SHEETS_WRITES_PER_SYNC = 25
SHEETS_WRITE_DELAY_SECONDS = 2

_SKIP_PFC = {"TRANSFER_IN", "TRANSFER_OUT", "INCOME"}
_SKIP_PFC_DETAILED = {"LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"}
_SKIP_MERCHANT_PATTERNS = ("payment thank you", "autopay", "automatic payment")


def _should_skip(txn) -> bool:
    pfc = getattr(txn, "personal_finance_category", None)
    if pfc:
        primary = getattr(pfc, "primary", None) or (pfc.get("primary") if isinstance(pfc, dict) else None)
        if primary and primary in _SKIP_PFC:
            return True
        detailed = getattr(pfc, "detailed", None) or (pfc.get("detailed") if isinstance(pfc, dict) else None)
        if detailed and detailed in _SKIP_PFC_DETAILED:
            return True
    merchant = (txn.merchant_name or txn.name or "").lower()
    if any(p in merchant for p in _SKIP_MERCHANT_PATTERNS):
        return True
    return False


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]


def run_sync() -> dict:
    client = get_plaid_client()
    tokens = get_access_tokens()

    if not tokens:
        return {"error": "No Plaid access tokens configured", "added": 0}

    mappings = load_mappings()

    # Phase 1: read the cursors. Short-lived, read-only.
    with get_db() as conn:
        cursors = {
            _token_key(token): _read_cursor(conn, _token_key(token))
            for token, _ in tokens
        }

    # Phase 2: all Plaid I/O, with no connection open. Holding the SQLite write
    # lock across these HTTP calls locks out every other writer for the whole sync.
    fetched = [
        _fetch_token(client, token, institution, cursors[_token_key(token)])
        for token, institution in tokens
    ]

    # Phase 3: one short write transaction for everything we fetched.
    total_added = 0
    total_modified = 0
    total_removed = 0
    synced_ids: list[str] = []

    with get_db() as conn:
        for batch in fetched:
            _write_accounts(conn, batch["accounts"], batch["institution"])

            for txn in batch["upserts"]:
                _upsert_transaction(conn, txn, mappings)
                synced_ids.append(txn.transaction_id)

            for txn_id in batch["removed_ids"]:
                conn.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))

            total_added += batch["added"]
            total_modified += batch["modified"]
            total_removed += len(batch["removed_ids"])

            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """INSERT INTO sync_state (account_id, cursor, last_synced_at)
                   VALUES (?, ?, ?)
                   ON CONFLICT(account_id) DO UPDATE SET cursor = ?, last_synced_at = ?""",
                (batch["key"], batch["cursor"], now, batch["cursor"], now),
            )

        conn.commit()

        # Fetch only the transactions from this sync batch for Sheets write
        batch_rows = []
        if synced_ids:
            placeholders = ",".join("?" * len(synced_ids))
            batch_rows = conn.execute(
                f"SELECT * FROM transactions WHERE id IN ({placeholders})",
                synced_ids,
            ).fetchall()

    is_initial_backfill = total_added > SHEETS_WRITES_PER_SYNC

    if is_initial_backfill:
        logger.info(
            f"Initial backfill: {total_added} transactions saved to DB. "
            f"Skipping Sheets writes — use POST /api/sheets/retry to sync gradually."
        )
    elif batch_rows:
        spreadsheet = get_spreadsheet()
        writes_done = 0
        for row in batch_rows:
            if writes_done >= SHEETS_WRITES_PER_SYNC:
                logger.info(f"Sheets write cap reached ({SHEETS_WRITES_PER_SYNC}), remaining will retry later.")
                break
            try:
                write_transaction_to_sheets(dict(row), spreadsheet=spreadsheet)
                writes_done += 1
                if writes_done < len(batch_rows):
                    time.sleep(SHEETS_WRITE_DELAY_SECONDS)
            except Exception as e:
                logger.warning(f"Sheets write failed during sync for {row['id']}: {e}")

    return {
        "added": total_added,
        "modified": total_modified,
        "removed": total_removed,
    }


def _read_cursor(conn, key: str) -> str | None:
    row = conn.execute(
        "SELECT cursor FROM sync_state WHERE account_id = ?", (key,)
    ).fetchone()
    return row["cursor"] if row else None


def _fetch_token(client, access_token: str, institution: str, cursor: str | None) -> dict:
    """Pull everything Plaid has for one token. No DB connection is held here."""
    try:
        accounts = get_accounts(client, access_token)
    except Exception as e:
        logger.warning(f"Failed to fetch accounts for {institution}: {type(e).__name__}")
        accounts = []

    upserts = []
    removed_ids = []
    added = 0
    modified = 0

    if cursor is None:
        for txn in backfill_transactions(client, access_token):
            if txn.pending or _should_skip(txn):
                continue
            upserts.append(txn)
            added += 1
        # A fresh cursor from "" so the next sync picks up where the backfill ended.
        new_cursor = sync_transactions(client, access_token, "")["cursor"]
    else:
        result = sync_transactions(client, access_token, cursor)
        new_cursor = result["cursor"]

        for txn in result["added"]:
            if txn.pending or _should_skip(txn):
                continue
            upserts.append(txn)
            added += 1

        for txn in result["modified"]:
            if txn.pending or _should_skip(txn):
                continue
            upserts.append(txn)
            modified += 1

        for txn in result["removed"]:
            txn_id = txn.transaction_id if hasattr(txn, "transaction_id") else txn.get("transaction_id")
            if txn_id:
                removed_ids.append(txn_id)

    return {
        "key": _token_key(access_token),
        "institution": institution,
        "accounts": accounts,
        "cursor": new_cursor,
        "upserts": upserts,
        "removed_ids": removed_ids,
        "added": added,
        "modified": modified,
    }


def _write_accounts(conn, accounts: list[dict], institution: str):
    now = datetime.now(timezone.utc).isoformat()
    for acct in accounts:
        conn.execute(
            """INSERT INTO plaid_accounts (plaid_account_id, official_name, institution, account_mask, account_type, last_synced_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(plaid_account_id) DO UPDATE SET
                 official_name = excluded.official_name,
                 institution = excluded.institution,
                 account_mask = excluded.account_mask,
                 account_type = excluded.account_type,
                 last_synced_at = excluded.last_synced_at""",
            (acct["account_id"], acct["official_name"], institution, acct["mask"], acct["type"], now),
        )


def _upsert_transaction(conn, txn, mappings: list[dict]):
    raw_merchant = txn.merchant_name or txn.name
    category = map_category(raw_merchant, mappings)

    conn.execute(
        """INSERT INTO transactions (id, date, type, raw_merchant, amount, source, plaid_account_id)
           VALUES (?, ?, ?, ?, ?, 'plaid', ?)
           ON CONFLICT(id) DO UPDATE SET
             date = excluded.date,
             type = excluded.type,
             raw_merchant = excluded.raw_merchant,
             amount = excluded.amount,
             synced_to_sheets = 0""",
        (
            txn.transaction_id,
            txn.date.isoformat() if hasattr(txn.date, "isoformat") else str(txn.date),
            category,
            raw_merchant,
            abs(txn.amount),
            txn.account_id,
        ),
    )
