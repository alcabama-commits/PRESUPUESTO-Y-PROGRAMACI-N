import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_FILE_PATH = path.resolve(__dirname, '..', 'ITEMS_OBRA.json')
const PORT = Number.parseInt(process.env.PORT ?? '5174', 10)

const app = express()
app.use(express.json({ limit: '20mb' }))

app.get('/api/items', async (_req, res) => {
  try {
    const raw = await fs.readFile(DATA_FILE_PATH, 'utf-8')
    const data = JSON.parse(raw)
    res.json(data)
  } catch (error) {
    res.status(500).json({
      error: 'No se pudo leer o parsear el archivo JSON.',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

app.put('/api/items', async (req, res) => {
  const data = req.body
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Body inválido. Se esperaba un JSON (objeto).' })
    return
  }

  try {
    const formatted = JSON.stringify(data, null, 2) + '\n'
    await fs.writeFile(DATA_FILE_PATH, formatted, 'utf-8')
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      error: 'No se pudo escribir el archivo JSON.',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`)
  console.log(`Archivo JSON: ${DATA_FILE_PATH}`)
})

