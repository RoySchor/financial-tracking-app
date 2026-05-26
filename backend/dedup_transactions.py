"""
Remove sheets_import transactions that are duplicates of Plaid-synced transactions.

When Plaid coverage overlaps with manual sheet entries, both end up in the DB.
This script identifies and removes the sheets_import copies, keeping Plaid as
the authoritative source.

Match criteria: same amount (±$0.01), date within ±1 day.
False-positive guard: if both merchants are known and clearly unrelated, skip.

Run standalone:  python dedup_transactions.py [--dry-run]
Or via:          make dedup
"""

import argparse
import logging
import sys
from database import get_db

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Merchant pairs that happen to share amounts but are different transactions.
# Normalized to lowercase. If sheets merchant contains key AND plaid merchant
# contains value (or vice versa), it's a false positive.
_FALSE_POSITIVE_PAIRS = [
    ("lamb", "amazon"),
    ("chatgpt", "claude"),
    ("openai", "claude"),
    ("openai", "anthropic"),
]


def _is_false_positive(sheets_merchant: str, plaid_merchant: str) -> bool:
    sm = (sheets_merchant or "").lower()
    pm = (plaid_merchant or "").lower()
    for a, b in _FALSE_POSITIVE_PAIRS:
        if (a in sm and b in pm) or (a in pm and b in sm):
            return True
    return False


def run_dedup(dry_run: bool = False) -> dict:
    with get_db() as conn:
        # Find sheets_import entries that match a Plaid entry
        matches = conn.execute("""
            SELECT si.id as sheets_id,
                   si.date as sheets_date,
                   si.raw_merchant as sheets_merchant,
                   si.amount as sheets_amount,
                   p.id as plaid_id,
                   p.date as plaid_date,
                   p.raw_merchant as plaid_merchant
            FROM transactions si
            JOIN transactions p
              ON ABS(si.amount - p.amount) < 0.01
              AND ABS(julianday(si.date) - julianday(p.date)) <= 1
            WHERE si.source = 'sheets_import'
              AND p.source = 'plaid'
            ORDER BY si.date
        """).fetchall()

        # Deduplicate: one sheets_import entry may match multiple Plaid entries
        # (e.g., MTA $3.00 matches several MTA rides). We only need to flag
        # each sheets_import ID once.
        to_delete: set[str] = set()
        skipped_fp: list[tuple[str, str]] = []

        for row in matches:
            sid = row["sheets_id"]
            if sid in to_delete:
                continue
            if _is_false_positive(row["sheets_merchant"], row["plaid_merchant"]):
                skipped_fp.append((row["sheets_merchant"], row["plaid_merchant"]))
                continue
            to_delete.add(sid)

        if dry_run:
            logger.info(f"DRY RUN: would delete {len(to_delete)} sheets_import duplicates")
            if skipped_fp:
                logger.info(f"  Skipped {len(skipped_fp)} false positives")
            if to_delete:
                total = conn.execute(
                    f"SELECT ROUND(SUM(amount), 2) as t FROM transactions WHERE id IN ({','.join('?' * len(to_delete))})",
                    list(to_delete),
                ).fetchone()["t"]
                logger.info(f"  Total amount: ${total}")
        else:
            if to_delete:
                placeholders = ",".join("?" * len(to_delete))
                conn.execute(
                    f"DELETE FROM transactions WHERE id IN ({placeholders})",
                    list(to_delete),
                )
                conn.commit()
            logger.info(f"Deleted {len(to_delete)} duplicate sheets_import entries")
            if skipped_fp:
                logger.info(f"Skipped {len(skipped_fp)} false positives")

    return {"deleted": len(to_delete), "false_positives_skipped": len(skipped_fp)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remove duplicate sheets_import transactions")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without doing it")
    args = parser.parse_args()
    result = run_dedup(dry_run=args.dry_run)
    sys.exit(0)
