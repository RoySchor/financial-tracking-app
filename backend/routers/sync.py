import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from services.sync_service import run_sync

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sync"])


@router.post("/sync")
def trigger_sync():
    try:
        result = run_sync()
        if "error" in result:
            return JSONResponse(status_code=400, content=result)
        return result
    except Exception as e:
        logger.exception("Sync failed")
        return JSONResponse(
            status_code=500,
            content={"error": f"Sync failed: {type(e).__name__}"},
        )
