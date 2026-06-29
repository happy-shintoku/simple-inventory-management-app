from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class ProductBase(SQLModel):
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    price: int = Field(ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    threshold: int = Field(default=5, ge=0)


class Product(ProductBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(SQLModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[int] = None
    stock_quantity: Optional[int] = None
    threshold: Optional[int] = None


class ProductRead(ProductBase):
    id: int


class StockLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int
    change_quantity: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    action_type: str
