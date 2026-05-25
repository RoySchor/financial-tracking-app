from fastapi import APIRouter, HTTPException

from database import get_db
from models import CategoryMappingOut, CategoryMappingIn

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=list[CategoryMappingOut])
def list_categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM category_mappings ORDER BY priority DESC, pattern"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/categories", response_model=CategoryMappingOut)
def upsert_category(mapping: CategoryMappingIn):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM category_mappings WHERE pattern = ?", (mapping.pattern,)
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE category_mappings SET category = ?, priority = ? WHERE pattern = ?",
                (mapping.category, mapping.priority, mapping.pattern),
            )
        else:
            conn.execute(
                "INSERT INTO category_mappings (pattern, category, priority) VALUES (?, ?, ?)",
                (mapping.pattern, mapping.category, mapping.priority),
            )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM category_mappings WHERE pattern = ?", (mapping.pattern,)
        ).fetchone()
    return dict(row)


@router.delete("/categories/{mapping_id}")
def delete_category(mapping_id: int):
    with get_db() as conn:
        result = conn.execute("DELETE FROM category_mappings WHERE id = ?", (mapping_id,))
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Mapping not found")
    return {"deleted": True}
