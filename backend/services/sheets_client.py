import os
import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def get_sheets_client():
    creds_path = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
    if not creds_path or not os.path.exists(creds_path):
        return None

    credentials = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    return gspread.authorize(credentials)


def get_spreadsheet():
    client = get_sheets_client()
    if client is None:
        return None

    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
    if not spreadsheet_id:
        return None

    return client.open_by_key(spreadsheet_id)
