from pydantic import BaseModel
from typing import Optional
from datetime import date


class TransactionOut(BaseModel):
    id: str
    date: date
    type: str
    raw_merchant: Optional[str] = None
    amount: float
    source: str
    plaid_account_id: Optional[str] = None
    synced_to_sheets: bool = False
    created_at: Optional[str] = None


class CashExpenseIn(BaseModel):
    date: date
    type: str
    amount: float


class CategoryMappingOut(BaseModel):
    id: int
    pattern: str
    category: str
    priority: int


class CategoryMappingIn(BaseModel):
    pattern: str
    category: str
    priority: int = 0


class IncomeOut(BaseModel):
    id: int
    date: date
    type: str
    gross_pay: float
    taxes: float
    pre_tax_deductions: float
    post_tax_deductions: float
    net_pay: float
    information: Optional[str] = None
    synced_to_sheets: bool = False
    created_at: Optional[str] = None


class IncomeIn(BaseModel):
    date: date
    type: str
    gross_pay: float
    taxes: float
    pre_tax_deductions: float
    post_tax_deductions: float
    net_pay: float
    information: Optional[str] = None


class AssetOut(BaseModel):
    id: int
    bank_group: str
    account_name: str
    current_amount: float
    total_dividends: float = 0
    apy: float = 0
    total_interest: float = 0
    fee: float = 0
    notes: Optional[str] = None
    last_updated: date
    synced_to_sheets: bool = False


class AssetIn(BaseModel):
    bank_group: str
    account_name: str
    current_amount: float
    total_dividends: float = 0
    apy: float = 0
    total_interest: float = 0
    fee: float = 0
    notes: Optional[str] = None


class RecurringExpenseOut(BaseModel):
    id: int
    label: str
    full_name: str
    amount: float
    day_of_month: int
    updated_at: Optional[str] = None


class RecurringExpenseIn(BaseModel):
    amount: float
    full_name: Optional[str] = None
    day_of_month: Optional[int] = None


class StatusOut(BaseModel):
    last_sync: Optional[str] = None
    total_transactions: int = 0
    failed_sheets_writes: int = 0
    db_size_mb: float = 0
