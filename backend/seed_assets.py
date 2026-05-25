"""Pull manual assets from Google Sheet.

Reads the "Rough Asset Portfolio" sheet and creates asset entries for any rows
that don't already have a matching Plaid-synced account. Safe to run multiple
times — uses upsert logic (skips existing assets by bank_group + account_name).
"""
import sys
from pathlib import Path
from datetime import date
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
sys.path.insert(0, str(Path(__file__).parent))
from database import get_db, run_migrations
from services.sheets_client import get_spreadsheet

run_migrations()

spreadsheet = get_spreadsheet()
if spreadsheet is None:
    print("Error: Google Sheets credentials not configured. Check .env")
    sys.exit(1)

worksheet = spreadsheet.worksheet("Rough Asset Portfolio")
all_values = worksheet.get_all_values()

# Header at row 3 (index 2): Bank/Holding Group, Account Name, Current Amount,
# Total Dividends Received, APY, Total Interest Earned, Fee, Notes
header_idx = None
for i, row in enumerate(all_values):
    if row[0] == "Bank / Holding Group" or row[0] == "Bank/Holding Group":
        header_idx = i
        break

if header_idx is None:
    print("Error: Could not find header row in sheet")
    sys.exit(1)

data_rows = all_values[header_idx + 1:]

# Get Plaid account names to skip (these are already synced)
with get_db() as conn:
    plaid_rows = conn.execute(
        "SELECT institution, COALESCE(display_name, official_name) as name FROM plaid_accounts"
    ).fetchall()

plaid_set = {(r["institution"], r["name"]) for r in plaid_rows}

today = date.today().isoformat()
count = 0

def parse_number(val: str) -> float:
    cleaned = val.replace("$", "").replace(",", "").replace("%", "").strip()
    if not cleaned:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

with get_db() as conn:
    for row in data_rows:
        if len(row) < 3 or not row[0].strip() or not row[1].strip():
            continue

        bank_group = row[0].strip()
        account_name = row[1].strip()

        # Skip if this is a Plaid-synced account
        if (bank_group, account_name) in plaid_set:
            continue

        current_amount = parse_number(row[2]) if len(row) > 2 else 0.0
        total_dividends = parse_number(row[3]) if len(row) > 3 else 0.0
        apy = parse_number(row[4]) if len(row) > 4 else 0.0
        total_interest = parse_number(row[5]) if len(row) > 5 else 0.0
        fee = parse_number(row[6]) if len(row) > 6 else 0.0
        notes = row[7].strip() if len(row) > 7 and row[7].strip() else None

        existing = conn.execute(
            "SELECT id FROM assets WHERE bank_group = ? AND account_name = ?",
            (bank_group, account_name),
        ).fetchone()

        if existing:
            continue

        conn.execute(
            """INSERT INTO assets (bank_group, account_name, current_amount,
               total_dividends, apy, total_interest, fee, notes, last_updated)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (bank_group, account_name, current_amount, total_dividends,
             apy, total_interest, fee, notes, today),
        )
        count += 1

    conn.commit()

print(f"Pulled {count} manual assets from sheet ({len(data_rows)} total rows, {len(plaid_set)} Plaid accounts skipped)")

# Mark liquid accounts — these are accounts readily convertible to cash
LIQUID_MANUAL = [
    ("Chase", "%"),
    ("Coinbase", "%"),
    ("Wealthfront", "Individual Cash Account"),
]
LIQUID_PLAID = [
    ("Schwab", "Individual"),
    ("Wealthfront", "Individual Automated Investing Account"),
]

with get_db() as conn:
    liquid_count = 0
    for institution, name_pattern in LIQUID_MANUAL:
        r = conn.execute(
            "UPDATE assets SET is_liquid = 1 WHERE bank_group = ? AND account_name LIKE ? AND is_liquid = 0",
            (institution, name_pattern),
        )
        liquid_count += r.rowcount
    for institution, name in LIQUID_PLAID:
        r = conn.execute(
            "UPDATE plaid_accounts SET is_liquid = 1 WHERE institution = ? AND official_name = ? AND is_liquid = 0",
            (institution, name),
        )
        liquid_count += r.rowcount
    conn.commit()

if liquid_count:
    print(f"Marked {liquid_count} accounts as liquid")
