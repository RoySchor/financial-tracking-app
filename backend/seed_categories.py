import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database import get_db, run_migrations

run_migrations()
data = json.loads((Path(__file__).parent.parent / "config" / "categories.json").read_text())

with get_db() as conn:
    for m in data:
        conn.execute(
            "INSERT OR IGNORE INTO category_mappings (pattern, category, priority) VALUES (?, ?, ?)",
            (m["pattern"], m["category"], m["priority"]),
        )
    conn.commit()

print(f"Seeded {len(data)} category mappings")
