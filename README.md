# 📦 簡易在庫管理 ＆ 発注アラートシステム (SPA構成)

地元の商店やコンビニ、校内の購買部などでの棚卸しや仕入れ管理をデジタル化する、シンプルなWebアプリケーションです。

このプロジェクトは、フロントエンド（React）とバックエンド（FastAPI）を明確に分けた **SPA（シングルページアプリケーション）構成**で開発します。

---

## 🛠️ システム構成と技術スタック

### 1. フロントエンド (Frontend)
- **フレームワーク**: React (Vite経由で構築)
- **デザイン（CSS）**: **Pico.css** (HTMLタグに適用するだけで美しく仕上がるミニマルCSS)
- **主な役割**: 画面の表示、フォームの入力、バックエンドAPIとの通信（Fetch APIなど）

### 2. バックエンド (Backend)
- **フレームワーク**: FastAPI (Python)
- **ORM（データベース操作）**: **SQLModel** (PydanticとSQLAlchemyを融合したモダンなライブラリ)
- **データベース**: SQLite (`inventory.db`)
- **主な役割**: データベースとのデータのやり取り、ビジネスロジック、JSON形式のAPI提供

---

## 💾 データベース設計 (SQLModel)

バックエンドでは、SQLModelを使って以下の2つのテーブル（モデル）を構築します。

### 1. Product（商品テーブル）
- `id`: 整数 (主キー, 自動インクリメント)
- `name`: 文字列 (商品名)
- `category`: 文字列 (カテゴリー)
- `price`: 整数 (単価)
- `stock_quantity`: 整数 (現在の在庫数, 初期値は0)
- `threshold`: 整数 (適正在庫/しきい値, 初期値は5)

### 2. StockLog（入出庫履歴テーブル）
- `id`: 整数 (主キー, 自動インクリメント)
- `product_id`: 整数 (商品ID)
- `change_quantity`: 整数 (変更された数。例: 入庫なら `+10`、出庫なら `-2`)
- `timestamp`: 文字列または日時 (履歴日時)
- `action_type`: 文字列 (「入庫」「出庫」「新規登録」など)

---

## 📂 ディレクトリ構成（例）

    inventory-app/
    ├── backend/              # バックエンド (FastAPI)
    │   ├── app.py            # メインプログラム (CORS設定、APIエンドポイント)
    │   ├── database.py       # DB接続、テーブル初期化
    │   └── models.py         # SQLModelによるデータ定義
    ├── frontend/             # フロントエンド (React)
    │   ├── src/
    │   │   ├── App.jsx       # メイン画面 (Pico.cssを使用)
    │   │   └── main.jsx
    │   ├── index.html
    │   └── package.json
    └── README.md             # 本ファイル

---

## 🚀 ローカル起動手順

開発時は、バックエンドとフロントエンドをそれぞれ別々のターミナルで起動します。

### バックエンドの起動 (Port: 8000)

    cd backend
    python -m venv venv
    # Windowsの場合
    venv\Scripts\activate
    # macOS/Linuxの場合
    source venv/bin/activate

    pip install fastapi uvicorn sqlmodel
    uvicorn app:app --reload

実装済みのバックエンドAPI（商品CRUD）は以下です。

- `GET /health` : ヘルスチェック
- `POST /products` : 商品作成
- `GET /products` : 商品一覧取得（`offset`/`limit`対応）
- `GET /products/{product_id}` : 商品詳細取得
- `PATCH /products/{product_id}` : 商品情報更新（部分更新）
- `DELETE /products/{product_id}` : 商品削除

### フロントエンドの起動 (Port: 5173 など)

    cd frontend
    npm install
    # CSSフレームワークをインストール
    npm install @picocss/pico
    npm run dev

実装済みのフロント機能（Feature #2）は以下です。

- Pico.css を導入した在庫管理画面
- 商品登録フォーム（商品名、カテゴリー、単価、初期在庫、しきい値）
- 商品一覧表示
- 在庫増減操作（入庫 + / 出庫 -）
- しきい値以下在庫の強調表示

フロントエンドのAPI接続先は以下の環境変数で変更できます（未指定時は `http://127.0.0.1:8000`）。

    VITE_API_BASE_URL=http://127.0.0.1:8000
