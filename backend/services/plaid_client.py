import os
from datetime import date, timedelta

import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest


def get_plaid_client():
    configuration = plaid.Configuration(
        host=plaid.Environment.Production,
        api_key={
            "clientId": os.getenv("PLAID_CLIENT_ID"),
            "secret": os.getenv("PLAID_SECRET"),
        },
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


def get_access_tokens() -> list[tuple[str, str]]:
    tokens = []
    for key, val in os.environ.items():
        if key.startswith("PLAID_ACCESS_TOKEN_") and val:
            label = key.replace("PLAID_ACCESS_TOKEN_", "").replace("_", " ").title()
            tokens.append((val, label))
    return tokens


def get_accounts(client, access_token: str) -> list[dict]:
    request = AccountsGetRequest(access_token=access_token)
    response = client.accounts_get(request)
    results = []
    for acct in response.accounts:
        results.append({
            "account_id": acct.account_id,
            "official_name": acct.official_name or acct.name,
            "name": acct.name,
            "mask": acct.mask,
            "type": acct.type.value if hasattr(acct.type, "value") else str(acct.type),
        })
    return results


def sync_transactions(client, access_token: str, cursor: str | None):
    added = []
    modified = []
    removed = []
    has_more = True
    next_cursor = cursor or ""

    while has_more:
        request = TransactionsSyncRequest(
            access_token=access_token,
            cursor=next_cursor,
        )
        response = client.transactions_sync(request)
        added.extend(response.added)
        modified.extend(response.modified)
        removed.extend(response.removed)
        next_cursor = response.next_cursor
        has_more = response.has_more

    return {
        "added": added,
        "modified": modified,
        "removed": removed,
        "cursor": next_cursor,
    }


def get_investment_holdings(client, access_token: str) -> dict | None:
    try:
        request = InvestmentsHoldingsGetRequest(access_token=access_token)
        response = client.investments_holdings_get(request)
        return {
            "accounts": response.accounts,
            "holdings": response.holdings,
            "securities": response.securities,
        }
    except plaid.ApiException as e:
        if "PRODUCTS_NOT_READY" in str(e.body) or "PRODUCT_NOT_READY" in str(e.body):
            return None
        raise


def get_investment_transactions(client, access_token: str, start_date: date | None = None, end_date: date | None = None) -> list | None:
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()

    try:
        request = InvestmentsTransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date,
        )
        response = client.investments_transactions_get(request)
        return response.investment_transactions
    except plaid.ApiException as e:
        if "PRODUCTS_NOT_READY" in str(e.body) or "PRODUCT_NOT_READY" in str(e.body):
            return None
        raise


def backfill_transactions(client, access_token: str, start_date: date | None = None):
    if not start_date:
        start_date = date(2022, 1, 1)
    end_date = date.today()

    all_transactions = []
    total = 1
    offset = 0

    while offset < total:
        request = TransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date,
            options=TransactionsGetRequestOptions(offset=offset, count=500),
        )
        response = client.transactions_get(request)
        all_transactions.extend(response.transactions)
        total = response.total_transactions
        offset += len(response.transactions)

    return all_transactions
