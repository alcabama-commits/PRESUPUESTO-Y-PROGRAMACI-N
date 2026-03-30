import { useEffect, useMemo, useState } from 'react'
import './App.css'

type SubItem = {
  concepto: string
  unidad: string
  detalle: string
}

type Item = {
  id: string
  descripcion: string
  sub_items: SubItem[]
}

type Capitulo = {
  nombre: string
  items: Item[]
}

type RootData = {
  presupuesto_obra_bogota?: Record<string, Capitulo>
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function App() {
  const [data, setData] = useState<RootData | null>(null)
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle')
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [message, setMessage] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [newItemChapterKey, setNewItemChapterKey] = useState<string>('')
  const [newItemId, setNewItemId] = useState('')
  const [newItemDescripcion, setNewItemDescripcion] = useState('')

  const capitulosEntries = useMemo(() => {
    const presupuesto = data?.presupuesto_obra_bogota ?? {}
    return Object.entries(presupuesto).filter(([, cap]) => {
      return Boolean(cap && typeof cap === 'object' && Array.isArray(cap.items))
    })
  }, [data])

  const filteredCapitulosEntries = useMemo(() => {
    const q = normalizeText(query.trim())
    if (!q) return capitulosEntries

    const match = (text: string) => normalizeText(text).includes(q)

    return capitulosEntries
      .map(([capKey, cap]) => {
        const items = cap.items
          .map((item) => {
            const matchesItem =
              match(item.id ?? '') ||
              match(item.descripcion ?? '') ||
              (item.sub_items ?? []).some((s) => {
                return (
                  match(s.concepto ?? '') ||
                  match(s.unidad ?? '') ||
                  match(s.detalle ?? '')
                )
              })

            return matchesItem ? item : null
          })
          .filter(Boolean) as Item[]

        const matchesCapituloName = match(cap.nombre ?? '')
        if (matchesCapituloName) return [capKey, cap] as const
        if (items.length === 0) return null
        return [
          capKey,
          {
            ...cap,
            items,
          },
        ] as const
      })
      .filter(Boolean) as Array<[string, Capitulo]>
  }, [capitulosEntries, query])

  async function load() {
    setLoadState('loading')
    setMessage(null)
    setSaveState('idle')

    try {
      const res = await fetch('/api/items')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as RootData
      setData(json)
      setLoadState('loaded')

      const firstKey =
        Object.keys(json.presupuesto_obra_bogota ?? {})[0] ?? ''
      setNewItemChapterKey(firstKey)
    } catch (error) {
      setLoadState('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function save() {
    if (!data) return
    setSaveState('saving')
    setMessage(null)

    try {
      const res = await fetch('/api/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1500)
    } catch (error) {
      setSaveState('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function updateCapituloNombre(capKey: string, nombre: string) {
    setData((prev) => {
      if (!prev?.presupuesto_obra_bogota) return prev
      const cap = prev.presupuesto_obra_bogota[capKey]
      if (!cap) return prev
      return {
        ...prev,
        presupuesto_obra_bogota: {
          ...prev.presupuesto_obra_bogota,
          [capKey]: { ...cap, nombre },
        },
      }
    })
  }

  function updateItem(capKey: string, itemIndex: number, patch: Partial<Item>) {
    setData((prev) => {
      const presupuesto = prev?.presupuesto_obra_bogota
      if (!presupuesto) return prev
      const cap = presupuesto[capKey]
      if (!cap) return prev
      const items = cap.items.slice()
      const current = items[itemIndex]
      if (!current) return prev
      items[itemIndex] = { ...current, ...patch }
      return {
        ...prev,
        presupuesto_obra_bogota: {
          ...presupuesto,
          [capKey]: { ...cap, items },
        },
      }
    })
  }

  function updateSubItem(
    capKey: string,
    itemIndex: number,
    subIndex: number,
    patch: Partial<SubItem>,
  ) {
    setData((prev) => {
      const presupuesto = prev?.presupuesto_obra_bogota
      if (!presupuesto) return prev
      const cap = presupuesto[capKey]
      if (!cap) return prev
      const items = cap.items.slice()
      const item = items[itemIndex]
      if (!item) return prev
      const subItems = (item.sub_items ?? []).slice()
      const current = subItems[subIndex]
      if (!current) return prev
      subItems[subIndex] = { ...current, ...patch }
      items[itemIndex] = { ...item, sub_items: subItems }
      return {
        ...prev,
        presupuesto_obra_bogota: {
          ...presupuesto,
          [capKey]: { ...cap, items },
        },
      }
    })
  }

  function addNewItem() {
    const capKey = newItemChapterKey
    const id = newItemId.trim()
    const descripcion = newItemDescripcion.trim()
    if (!capKey || !id || !descripcion) return

    setData((prev) => {
      const presupuesto = prev?.presupuesto_obra_bogota
      if (!presupuesto) return prev
      const cap = presupuesto[capKey]
      if (!cap) return prev

      const nextItem: Item = { id, descripcion, sub_items: [] }
      return {
        ...prev,
        presupuesto_obra_bogota: {
          ...presupuesto,
          [capKey]: {
            ...cap,
            items: [...cap.items, nextItem],
          },
        },
      }
    })

    setNewItemId('')
    setNewItemDescripcion('')
  }

  function addSubItem(capKey: string, itemIndex: number) {
    setData((prev) => {
      const presupuesto = prev?.presupuesto_obra_bogota
      if (!presupuesto) return prev
      const cap = presupuesto[capKey]
      if (!cap) return prev
      const items = cap.items.slice()
      const item = items[itemIndex]
      if (!item) return prev
      const subItems = (item.sub_items ?? []).slice()
      subItems.push({ concepto: '', unidad: '', detalle: '' })
      items[itemIndex] = { ...item, sub_items: subItems }
      return {
        ...prev,
        presupuesto_obra_bogota: {
          ...presupuesto,
          [capKey]: { ...cap, items },
        },
      }
    })
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="page">
      <header className="header">
        <div className="title">
          <h1>ITEMS de Obra</h1>
          <div className="subtitle">Auditoría y edición directa de ITEMS_OBRA.json</div>
        </div>

        <div className="actions">
          <button
            className="btn"
            onClick={load}
            disabled={loadState === 'loading'}
          >
            {loadState === 'loading' ? 'Cargando…' : 'Recargar'}
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={!data || saveState === 'saving'}
          >
            {saveState === 'saving'
              ? 'Guardando…'
              : saveState === 'saved'
                ? 'Guardado'
                : 'Guardar en JSON'}
          </button>
        </div>
      </header>

      <section className="toolbar">
        <input
          className="input"
          placeholder="Buscar (id, descripción, concepto, unidad, detalle)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="new-item">
          <select
            className="input"
            value={newItemChapterKey}
            onChange={(e) => setNewItemChapterKey(e.target.value)}
            disabled={!data}
          >
            {capitulosEntries.map(([capKey, cap]) => (
              <option key={capKey} value={capKey}>
                {capKey} — {cap.nombre}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="ID (ej: 4.1)"
            value={newItemId}
            onChange={(e) => setNewItemId(e.target.value)}
            disabled={!data}
          />
          <input
            className="input"
            placeholder="Descripción del item"
            value={newItemDescripcion}
            onChange={(e) => setNewItemDescripcion(e.target.value)}
            disabled={!data}
          />
          <button className="btn" onClick={addNewItem} disabled={!data}>
            Agregar item
          </button>
        </div>
      </section>

      {message ? <div className="message">{message}</div> : null}

      <main className="content">
        {loadState === 'error' ? (
          <div className="empty">
            No se pudo cargar el JSON. Verifica que exista el archivo
            ITEMS_OBRA.json en la carpeta padre.
          </div>
        ) : null}

        {data && filteredCapitulosEntries.length === 0 ? (
          <div className="empty">Sin resultados para “{query}”.</div>
        ) : null}

        {filteredCapitulosEntries.map(([capKey, cap]) => (
          <section key={capKey} className="capitulo">
            <div className="capitulo-header">
              <div className="capitulo-key">{capKey}</div>
              <input
                className="input capitulo-name"
                value={cap.nombre ?? ''}
                onChange={(e) => updateCapituloNombre(capKey, e.target.value)}
              />
              <div className="capitulo-count">{cap.items.length} items</div>
            </div>

            <div className="items">
              {cap.items.map((item, itemIndex) => {
                const itemKey = `${capKey}:${itemIndex}:${item.id}`
                const isExpanded = Boolean(expanded[itemKey])

                return (
                  <div key={itemKey} className="item">
                    <div className="item-row">
                      <button
                        className="btn small"
                        onClick={() => toggleExpanded(itemKey)}
                        title={isExpanded ? 'Contraer' : 'Expandir'}
                      >
                        {isExpanded ? '−' : '+'}
                      </button>

                      <input
                        className="input item-id"
                        value={item.id ?? ''}
                        onChange={(e) =>
                          updateItem(capKey, itemIndex, { id: e.target.value })
                        }
                      />
                      <input
                        className="input item-desc"
                        value={item.descripcion ?? ''}
                        onChange={(e) =>
                          updateItem(capKey, itemIndex, {
                            descripcion: e.target.value,
                          })
                        }
                      />

                      <button
                        className="btn small"
                        onClick={() => addSubItem(capKey, itemIndex)}
                      >
                        + Sub-item
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="subitems">
                        <div className="subitems-head">
                          <div>Concepto</div>
                          <div>Unidad</div>
                          <div>Detalle</div>
                        </div>
                        {(item.sub_items ?? []).map((s, subIndex) => (
                          <div className="subitems-row" key={subIndex}>
                            <input
                              className="input"
                              value={s.concepto ?? ''}
                              onChange={(e) =>
                                updateSubItem(
                                  capKey,
                                  itemIndex,
                                  subIndex,
                                  { concepto: e.target.value },
                                )
                              }
                            />
                            <input
                              className="input"
                              value={s.unidad ?? ''}
                              onChange={(e) =>
                                updateSubItem(
                                  capKey,
                                  itemIndex,
                                  subIndex,
                                  { unidad: e.target.value },
                                )
                              }
                            />
                            <textarea
                              className="input textarea"
                              value={s.detalle ?? ''}
                              onChange={(e) =>
                                updateSubItem(
                                  capKey,
                                  itemIndex,
                                  subIndex,
                                  { detalle: e.target.value },
                                )
                              }
                            />
                          </div>
                        ))}
                        {(item.sub_items ?? []).length === 0 ? (
                          <div className="subitems-empty">
                            Este item no tiene sub-items todavía.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

export default App
