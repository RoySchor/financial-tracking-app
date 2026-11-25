import os
import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# (connect, read) seconds. gspread's default is no timeout, so a stalled
# Google response would block the request (and the worker) indefinitely.
SHEETS_TIMEOUT = (10, 60)


def is_quota_error(exc: Exception) -> bool:
    """True for Sheets 429s (rate/quota), which say nothing about the row itself."""
    response = getattr(exc, "response", None)
    return getattr(response, "status_code", None) == 429


def get_sheets_client():
    creds_path = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
    if not creds_path or not os.path.exists(creds_path):
        return None

    credentials = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    client = gspread.authorize(credentials)
    client.set_timeout(SHEETS_TIMEOUT)
    return client


def get_spreadsheet():
    client = get_sheets_client()
    if client is None:
        return None

    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
    if not spreadsheet_id:
        return None

    return client.open_by_key(spreadsheet_id)
