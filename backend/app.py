from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from database import create_db_and_tables, get_session
from models import Product, ProductCreate, ProductRead, ProductUpdate, StockLog


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Simple Inventory Management API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.app\.github\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SessionDep = Annotated[Session, Depends(get_session)]


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, session: SessionDep) -> Product:
    product = Product.model_validate(payload)
    session.add(product)
    session.commit()
    session.refresh(product)

    stock_log = StockLog(
        product_id=product.id,
        change_quantity=product.stock_quantity,
        action_type="新規登録",
    )
    session.add(stock_log)
    session.commit()
    return product


@app.get("/products", response_model=list[ProductRead])
def list_products(
    session: SessionDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[Product]:
    statement = select(Product).offset(offset).limit(limit)
    products = session.exec(statement).all()
    return products


@app.get("/products/{product_id}", response_model=ProductRead)
def get_product(product_id: int, session: SessionDep) -> Product:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@app.patch("/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, session: SessionDep) -> Product:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    previous_stock = product.stock_quantity
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)

    session.add(product)
    session.commit()
    session.refresh(product)

    if "stock_quantity" in update_data:
        change_quantity = product.stock_quantity - previous_stock
        if change_quantity != 0:
            action_type = "入庫" if change_quantity > 0 else "出庫"
            stock_log = StockLog(
                product_id=product.id,
                change_quantity=change_quantity,
                action_type=action_type,
            )
            session.add(stock_log)
            session.commit()

    return product


@app.get("/logs", response_model=list[StockLog])
def list_logs(
    session: SessionDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[StockLog]:
    statement = select(StockLog).order_by(StockLog.timestamp.desc()).offset(offset).limit(limit)
    logs = session.exec(statement).all()
    return logs


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, session: SessionDep) -> None:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    session.delete(product)
    session.commit()
