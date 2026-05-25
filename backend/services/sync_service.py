import hashlib
import logging
from datetime import datetime, timezone

from database import get_db
from services.plaid_client import get_plaid_client, get_access_tokens, sync_transactions, backfill_transactions
from services.category_mapper import load_mappings, map_category
from services.sheets_client import get_spreadsheet
from services.sheets_writer import write_transaction_to_sheets

logger = logging.getLogger(__name__)


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:32]


def run_sync() -> dict:
    client = get_plaid_client()
    tokens = get_access_tokens()

    if not tokens:
        return {"error": "No Plaid access tokens configured", "added": 0}

    mappings = load_mappings()

    total_added = 0
    total_modified = 0
    total_removed = 0
    synced_ids: list[str] = []

    with get_db() as conn:
        for token in tokens:
            key = _token_key(token)

            cursor_row = conn.execute(
                "SELECT cursor FROM sync_state WHERE account_id = ?", (key,)
            ).fetchone()

            cursor = cursor_row["cursor"] if cursor_row else None

            if cursor is None:
                transactions = backfill_transactions(client, token)
                for txn in transactions:
                    if txn.pending:
                        continue
                    _upsert_transaction(conn, txn, mappings)
                    synced_ids.append(txn.transaction_id)
                    total_added += 1

                result = sync_transactions(client, token, "")
                new_cursor = result["cursor"]
            else:
                result = sync_transactions(client, token, cursor)
                new_cursor = result["cursor"]

                for txn in result["added"]:
                    if txn.pending:
                        continue
                    _upsert_transaction(conn, txn, mappings)
                    synced_ids.append(txn.transaction_id)
                    total_added += 1

                for txn in result["modified"]:
                    if txn.pending:
                        continue
                    _upsert_transaction(conn, txn, mappings)
                    synced_ids.append(txn.transaction_id)
                    total_modified += 1

                for txn in result["removed"]:
                    txn_id = txn.transaction_id if hasattr(txn, "transaction_id") else txn.get("transaction_id")
                    if txn_id:
                        conn.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
                        total_removed += 1

            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """INSERT INTO sync_state (account_id, cursor, last_synced_at)
                   VALUES (?, ?, ?)
                   ON CONFLICT(account_id) DO UPDATE SET cursor = ?, last_synced_at = ?""",
                (key, new_cursor, now, new_cursor, now),
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

    spreadsheet = get_spreadsheet()
    for row in batch_rows:
        try:
            write_transaction_to_sheets(dict(row), spreadsheet=spreadsheet)
        except Exception as e:
            logger.warning(f"Sheets write failed during sync for {row['id']}: {e}")

    return {
        "added": total_added,
        "modified": total_modified,
        "removed": total_removed,
    }


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
