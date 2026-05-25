import hashlib
import logging
import time
from datetime import date

import plaid

from database import get_db
from services.plaid_client import get_plaid_client, get_access_tokens, get_investment_holdings, get_investment_transactions
from services.sheets_client import get_spreadsheet

logger = logging.getLogger(__name__)

# Tokens that returned PRODUCTS_NOT_READY — skip on subsequent syncs this process lifetime
_SKIP_TOKENS: set[str] = set()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:16]


def run_investment_sync() -> dict:
    client = get_plaid_client()
    tokens = get_access_tokens()

    if not tokens:
        return {"accounts_synced": 0}

    accounts_synced = 0
    holdings_total = 0
    transactions_added = 0

    for token, institution in tokens:
        if _token_hash(token) in _SKIP_TOKENS:
            continue
        try:
            result = _sync_one_item(client, token, institution)
        except plaid.ApiException:
            logger.warning(f"Investment sync failed for {institution}: ApiException")
            _SKIP_TOKENS.add(_token_hash(token))
            continue
        except Exception as e:
            logger.warning(f"Investment sync failed for {institution}: {type(e).__name__}: {e}")
            continue
        if result is None:
            _SKIP_TOKENS.add(_token_hash(token))
            continue
        accounts_synced += result["accounts"]
        holdings_total += result["holdings"]
        transactions_added += result["transactions_added"]

    _sync_plaid_totals_to_sheets()

    return {
        "accounts_synced": accounts_synced,
        "holdings_total": holdings_total,
        "transactions_added": transactions_added,
    }


def _sync_one_item(client, access_token: str, institution: str) -> dict | None:
    holdings_data = get_investment_holdings(client, access_token)
    if holdings_data is None:
        return None

    # Fetch investment transactions outside DB context to avoid holding SQLite open during HTTP call
    inv_txns = get_investment_transactions(client, access_token)

    today = date.today().isoformat()

    with get_db() as conn:
        for security in holdings_data["securities"]:
            _upsert_security(conn, security)

        account_ids = set()
        for holding in holdings_data["holdings"]:
            account_ids.add(holding.account_id)

        for account_id in account_ids:
            conn.execute("DELETE FROM holdings WHERE plaid_account_id = ?", (account_id,))

        # Aggregate holdings by (account_id, security_id) — some institutions
        # report multiple lots for the same security
        aggregated: dict[tuple[str, str], dict] = {}
        for holding in holdings_data["holdings"]:
            key = (holding.account_id, holding.security_id)
            if key in aggregated:
                agg = aggregated[key]
                agg["quantity"] = (agg["quantity"] or 0) + (holding.quantity or 0)
                agg["cost_basis"] = (agg["cost_basis"] or 0) + (holding.cost_basis or 0) if agg["cost_basis"] is not None or holding.cost_basis is not None else None
                agg["institution_value"] = (agg["institution_value"] or 0) + (holding.institution_value or 0)
            else:
                aggregated[key] = {
                    "quantity": holding.quantity,
                    "cost_basis": holding.cost_basis,
                    "institution_value": holding.institution_value,
                    "institution_price": holding.institution_price,
                }

        for (acct_id, sec_id), agg in aggregated.items():
            conn.execute(
                """INSERT INTO holdings (plaid_account_id, security_id, quantity, cost_basis,
                   institution_value, institution_price, as_of_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    acct_id,
                    sec_id,
                    agg["quantity"],
                    agg["cost_basis"],
                    agg["institution_value"],
                    agg["institution_price"],
                    today,
                ),
            )

        for account_id in account_ids:
            total_value = sum(
                h.institution_value for h in holdings_data["holdings"]
                if h.account_id == account_id and h.institution_value
            )
            conn.execute(
                "INSERT OR REPLACE INTO portfolio_snapshots (plaid_account_id, date, total_value) VALUES (?, ?, ?)",
                (account_id, today, total_value),
            )

        txn_count = 0
        if inv_txns:
            for txn in inv_txns:
                result = conn.execute(
                    "INSERT OR IGNORE INTO investment_transactions (plaid_investment_transaction_id, plaid_account_id, security_id, date, type, subtype, quantity, price, amount, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        txn.investment_transaction_id,
                        txn.account_id,
                        txn.security_id,
                        txn.date.isoformat() if hasattr(txn.date, "isoformat") else str(txn.date),
                        str(txn.type) if txn.type else None,
                        str(txn.subtype) if txn.subtype else None,
                        txn.quantity,
                        txn.price,
                        txn.amount,
                        txn.name,
                    ),
                )
                if result.rowcount > 0:
                    txn_count += 1

        conn.commit()

    return {
        "accounts": len(account_ids),
        "holdings": len(holdings_data["holdings"]),
        "transactions_added": txn_count,
    }


def _upsert_security(conn, security):
    ticker = getattr(security, "ticker_symbol", None)
    name = getattr(security, "name", None)
    sec_type = str(security.type) if hasattr(security, "type") and security.type else None
    close_price = getattr(security, "close_price", None)
    close_price_as_of = getattr(security, "close_price_as_of", None)
    if close_price_as_of and hasattr(close_price_as_of, "isoformat"):
        close_price_as_of = close_price_as_of.isoformat()

    conn.execute(
        """INSERT INTO securities (security_id, ticker, name, type, close_price, close_price_as_of, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(security_id) DO UPDATE SET
             ticker = COALESCE(excluded.ticker, securities.ticker),
             name = COALESCE(excluded.name, securities.name),
             type = COALESCE(excluded.type, securities.type),
             close_price = excluded.close_price,
             close_price_as_of = excluded.close_price_as_of,
             updated_at = datetime('now')""",
        (security.security_id, ticker, name, sec_type, close_price, close_price_as_of),
    )


def _sync_plaid_totals_to_sheets():
    spreadsheet = get_spreadsheet()
    if spreadsheet is None:
        return

    with get_db() as conn:
        accounts = conn.execute(
            """SELECT pa.institution as bank_group,
                      COALESCE(pa.display_name, pa.official_name) as account_name,
                      SUM(h.institution_value) as total_value
               FROM holdings h
               JOIN plaid_accounts pa ON h.plaid_account_id = pa.plaid_account_id
               GROUP BY h.plaid_account_id""",
        ).fetchall()

    if not accounts:
        return

    try:
        worksheet = spreadsheet.worksheet("Rough Asset Portfolio")
        all_values = worksheet.get_all_values()

        for acct in accounts:
            bank_group = acct["bank_group"]
            account_name = acct["account_name"]
            total = acct["total_value"]
            if not bank_group or not account_name:
                continue

            for row_idx, row in enumerate(all_values, start=1):
                if len(row) >= 2 and row[0] == bank_group and row[1] == account_name:
                    worksheet.update(f"C{row_idx}", [[total]], value_input_option="USER_ENTERED")
                    time.sleep(3)
                    break
    except Exception as e:
        logger.warning(f"Plaid-to-sheets sync failed: {type(e).__name__}")
