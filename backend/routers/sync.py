import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from services.sync_service import run_sync
from services.investment_sync import run_investment_sync

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sync"])


@router.post("/sync")
def trigger_sync():
    try:
        result = run_sync()
        if "error" in result:
            return JSONResponse(status_code=400, content=result)

        try:
            inv_result = run_investment_sync()
            result["investments"] = inv_result
        except Exception as e:
            logger.warning(f"Investment sync failed: {type(e).__name__}")
            result["investments"] = {"error": type(e).__name__}

        return result
    except Exception as e:
        logger.error(f"Sync failed: {type(e).__name__}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Sync failed: {type(e).__name__}"},
        )
