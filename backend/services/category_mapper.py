import re

from database import get_db


def load_mappings() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT pattern, category FROM category_mappings ORDER BY priority DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def clean_merchant_name(raw: str) -> str:
    if not raw:
        return "Unknown"
    cleaned = re.sub(r"\s+\d{5,}$", "", raw)
    cleaned = re.sub(r"\s+[A-Z]{2}\s*$", "", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    # Title-case each word but preserve all-caps words (acronyms like MTA, ATM)
    words = cleaned.split()
    result = []
    for w in words:
        if w.isupper() and len(w) > 1:
            result.append(w)
        else:
            result.append(w.title())
    return " ".join(result) if result else cleaned


def map_category(raw_merchant: str | None, mappings: list[dict]) -> str:
    if not raw_merchant:
        return "Unknown"

    raw_lower = raw_merchant.lower()

    for m in mappings:
        if m["pattern"].lower() in raw_lower:
            return m["category"]

    return clean_merchant_name(raw_merchant)
