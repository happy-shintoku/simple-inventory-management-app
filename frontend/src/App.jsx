import { useEffect, useMemo, useState } from 'react'
import './App.css'

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location
    const codespacesHost = host.replace(/-\d+\.app\.github\.dev$/, '-8000.app.github.dev')
    if (codespacesHost !== host) {
      return `${protocol}//${codespacesHost}`
    }
  }

  return 'http://127.0.0.1:8000'
}

const API_BASE_URL = resolveApiBaseUrl()

const initialForm = {
  name: '',
  category: '',
  price: 0,
  stock_quantity: 0,
  threshold: 5,
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatSignedQuantity(value) {
  return value > 0 ? `+${value}` : `${value}`
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '').replaceAll('"', '""')
  return `"${normalized}"`
}

function createLogsCsv(logs, productNameById) {
  const header = ['履歴ID', '日時', '商品ID', '商品名', '操作', '増減数']
  const rows = logs.map((log) => [
    log.id,
    formatTimestamp(log.timestamp),
    log.product_id,
    productNameById[log.product_id] ?? `商品ID:${log.product_id}`,
    log.action_type,
    formatSignedQuantity(log.change_quantity),
  ])

  return [header, ...rows]
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

function App() {
  const [activeView, setActiveView] = useState('inventory')
  const [products, setProducts] = useState([])
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState(initialForm)
  const [stockInputs, setStockInputs] = useState({})
  const [thresholdInputs, setThresholdInputs] = useState({})
  const [loading, setLoading] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const totalStock = useMemo(
    () => products.reduce((sum, product) => sum + product.stock_quantity, 0),
    [products],
  )

  const lowStockProducts = useMemo(
    () => products.filter((product) => product.stock_quantity <= product.threshold),
    [products],
  )

  const productNameById = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product.name])),
    [products],
  )

  async function fetchProducts() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/products`)
      if (!response.ok) {
        throw new Error('商品一覧の取得に失敗しました')
      }

      const data = await response.json()
      setProducts(data)

      const stockDefaults = {}
      const thresholdDefaults = {}
      for (const product of data) {
        stockDefaults[product.id] = stockInputs[product.id] ?? 1
        thresholdDefaults[product.id] = thresholdInputs[product.id] ?? product.threshold
      }
      setStockInputs(stockDefaults)
      setThresholdInputs(thresholdDefaults)
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLogs() {
    setLogsLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/logs?limit=500`)
      if (!response.ok) {
        throw new Error('履歴一覧の取得に失敗しました')
      }

      const data = await response.json()
      setLogs(data)
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
    fetchLogs()
  }, [])

  function onChangeForm(event) {
    const { name, value, valueAsNumber } = event.target
    if (event.target.type === 'number') {
      setForm((prev) => ({
        ...prev,
        [name]: Number.isNaN(valueAsNumber) ? 0 : valueAsNumber,
      }))
      return
    }

    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function onSubmitProduct(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      const response = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        throw new Error('商品登録に失敗しました')
      }

      setForm(initialForm)
      setMessage('商品を登録しました')
      await fetchProducts()
      await fetchLogs()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStock(product, direction) {
    setError('')
    setMessage('')

    const deltaRaw = stockInputs[product.id] ?? 1
    const delta = Math.max(1, Number(deltaRaw) || 1)
    const nextStock =
      direction === 'increase'
        ? product.stock_quantity + delta
        : product.stock_quantity - delta

    if (nextStock < 0) {
      setError(`在庫は0未満にできません: ${product.name}`)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_quantity: nextStock }),
      })

      if (!response.ok) {
        throw new Error('在庫更新に失敗しました')
      }

      setMessage(
        direction === 'increase'
          ? `${product.name} を ${delta} 個入庫しました`
          : `${product.name} を ${delta} 個出庫しました`,
      )
      await fetchProducts()
      await fetchLogs()
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  async function updateThreshold(product) {
    setError('')
    setMessage('')

    const nextThreshold = Number(thresholdInputs[product.id])
    if (Number.isNaN(nextThreshold) || nextThreshold < 0) {
      setError(`しきい値は0以上で入力してください: ${product.name}`)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: nextThreshold }),
      })

      if (!response.ok) {
        throw new Error('しきい値の更新に失敗しました')
      }

      setMessage(`${product.name} のしきい値を ${nextThreshold} に更新しました`)
      await fetchProducts()
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  function exportLogsCsv() {
    if (logs.length === 0) {
      setError('CSV出力する履歴がありません')
      return
    }

    setExporting(true)
    setMessage('')
    setError('')

    try {
      const csv = createLogsCsv(logs, productNameById)
      const bom = '\uFEFF'
      const blob = new Blob([`${bom}${csv}`], {
        type: 'text/csv;charset=utf-8;',
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `stock-logs-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setMessage(`履歴CSVを出力しました (${logs.length}件)`)
    } catch {
      setError('CSV出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="container app-shell">
      <header className="page-header">
        <h1>簡易在庫管理</h1>
        <p>
          商品登録と在庫増減を同じ画面で管理します。API接続先: <strong>{API_BASE_URL}</strong>
        </p>
      </header>

      <nav className="view-tabs" aria-label="ページ切り替え">
        <button
          type="button"
          onClick={() => setActiveView('inventory')}
          className={activeView === 'inventory' ? '' : 'secondary'}
        >
          在庫管理
        </button>
        <button
          type="button"
          onClick={() => setActiveView('history')}
          className={activeView === 'history' ? '' : 'secondary'}
        >
          履歴一覧
        </button>
      </nav>

      {activeView === 'inventory' && lowStockProducts.length > 0 ? (
        <article className="message warning low-stock-alert">
          ⚠️ 在庫が不足している商品が {lowStockProducts.length} 件あります
        </article>
      ) : null}

      {message ? <article className="message success">{message}</article> : null}
      {error ? <article className="message error">{error}</article> : null}

      {activeView === 'inventory' ? (
        <>
          <section>
            <h2>商品登録</h2>
            <form onSubmit={onSubmitProduct} className="register-form">
              <div className="grid form-grid">
                <label>
                  商品名
                  <input
                    name="name"
                    value={form.name}
                    onChange={onChangeForm}
                    required
                    minLength={1}
                  />
                </label>

                <label>
                  カテゴリー
                  <input
                    name="category"
                    value={form.category}
                    onChange={onChangeForm}
                    required
                    minLength={1}
                  />
                </label>

                <label>
                  単価
                  <input
                    type="number"
                    name="price"
                    value={form.price}
                    onChange={onChangeForm}
                    min={0}
                    required
                  />
                </label>

                <label>
                  初期在庫
                  <input
                    type="number"
                    name="stock_quantity"
                    value={form.stock_quantity}
                    onChange={onChangeForm}
                    min={0}
                    required
                  />
                </label>

                <label>
                  しきい値
                  <input
                    type="number"
                    name="threshold"
                    value={form.threshold}
                    onChange={onChangeForm}
                    min={0}
                    required
                  />
                </label>
              </div>

              <button type="submit" aria-busy={submitting} disabled={submitting}>
                {submitting ? '登録中...' : '商品を登録'}
              </button>
            </form>
          </section>

          <section>
            <div className="inventory-title">
              <h2>在庫増減</h2>
              <small>
                商品数: {products.length} / 合計在庫: {totalStock}
              </small>
            </div>

            <button type="button" className="secondary refresh-button" onClick={fetchProducts}>
              一覧を更新
            </button>

            {loading ? <p>読み込み中...</p> : null}

            {!loading && products.length === 0 ? (
              <article>登録された商品がありません。まず商品登録を行ってください。</article>
            ) : null}

            {!loading && products.length > 0 ? (
              <figure>
                <table>
                  <thead>
                    <tr>
                      <th>商品名</th>
                      <th>カテゴリー</th>
                      <th>単価</th>
                      <th>在庫</th>
                      <th>しきい値</th>
                      <th>増減数</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const isLowStock = product.stock_quantity <= product.threshold
                      return (
                        <tr key={product.id} className={isLowStock ? 'low-stock-row' : ''}>
                          <td>{product.name}</td>
                          <td>{product.category}</td>
                          <td>{product.price.toLocaleString()} 円</td>
                          <td>
                            <strong className={isLowStock ? 'low-stock' : ''}>
                              {product.stock_quantity}
                            </strong>
                          </td>
                          <td>
                            <div className="threshold-edit">
                              <input
                                type="number"
                                min={0}
                                value={thresholdInputs[product.id] ?? product.threshold}
                                onChange={(event) => {
                                  const nextValue = Number(event.target.value)
                                  setThresholdInputs((prev) => ({
                                    ...prev,
                                    [product.id]: Number.isNaN(nextValue) ? 0 : nextValue,
                                  }))
                                }}
                              />
                              <button
                                type="button"
                                className="secondary compact"
                                onClick={() => updateThreshold(product)}
                              >
                                更新
                              </button>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              value={stockInputs[product.id] ?? 1}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value)
                                setStockInputs((prev) => ({
                                  ...prev,
                                  [product.id]: Number.isNaN(nextValue) ? 1 : nextValue,
                                }))
                              }}
                            />
                          </td>
                          <td>
                            <div className="button-row">
                              <button type="button" onClick={() => updateStock(product, 'increase')}>
                                入庫 +
                              </button>
                              <button
                                type="button"
                                className="contrast"
                                onClick={() => updateStock(product, 'decrease')}
                              >
                                出庫 -
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </figure>
            ) : null}
          </section>
        </>
      ) : (
        <section>
          <div className="history-title">
            <h2>履歴一覧</h2>
            <small>件数: {logs.length}</small>
          </div>

          <div className="history-actions">
            <button type="button" className="secondary" onClick={fetchLogs}>
              履歴を更新
            </button>
            <button
              type="button"
              onClick={exportLogsCsv}
              aria-busy={exporting}
              disabled={exporting || logs.length === 0}
            >
              {exporting ? 'CSV作成中...' : 'CSVエクスポート'}
            </button>
          </div>

          {logsLoading ? <p>読み込み中...</p> : null}

          {!logsLoading && logs.length === 0 ? <article>表示できる履歴がありません。</article> : null}

          {!logsLoading && logs.length > 0 ? (
            <figure>
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>商品名</th>
                    <th>操作</th>
                    <th>増減数</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatTimestamp(log.timestamp)}</td>
                      <td>{productNameById[log.product_id] ?? `商品ID:${log.product_id}`}</td>
                      <td>{log.action_type}</td>
                      <td>
                        <strong className={log.change_quantity < 0 ? 'log-outbound' : 'log-inbound'}>
                          {formatSignedQuantity(log.change_quantity)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          ) : null}
        </section>
      )}
    </main>
  )
}

export default App
