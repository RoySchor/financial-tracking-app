import re

from database import get_db

_ACRONYMS = {"MTA", "NJ", "NYC", "ATM", "DC", "NY", "LA", "SF", "ACH", "CVS", "LLC", "INC", "DBA"}


def load_mappings() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT pattern, category FROM category_mappings ORDER BY priority DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def _title_word(w: str) -> str:
    """Title-case a single word, preserving apostrophe-based names."""
    if not w:
        return w
    if w.upper() in _ACRONYMS:
        return w.upper()
    if "'" in w:
        idx = w.index("'")
        before = w[:idx]
        after = w[idx + 1:]
        if idx <= 2 and after:
            return before.capitalize() + "'" + after.capitalize()
        return before.capitalize() + "'" + after.lower()
    return w[0].upper() + w[1:].lower()


def clean_merchant_name(raw: str) -> str:
    if not raw:
        return "Unknown"
    cleaned = re.sub(r"\s+\d{5,}$", "", raw)
    cleaned = re.sub(r"\s+[A-Z]{2}\s*$", "", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    words = cleaned.split()
    result = [_title_word(w) for w in words]
    return " ".join(result) if result else cleaned


def map_category(raw_merchant: str | None, mappings: list[dict]) -> str:
    if not raw_merchant:
        return "Unknown"

    raw_lower = raw_merchant.lower()

    for m in mappings:
        if m["pattern"].lower() in raw_lower:
            return m["category"]

    return clean_merchant_name(raw_merchant)
