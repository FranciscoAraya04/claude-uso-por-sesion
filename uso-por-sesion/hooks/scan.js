// Reparte el consumo entre sesiones leyendo ~/.claude/projects: el del bloque de 5 h y el de la semana.
// Uso: node scan.js <inicioBloqueMs> <cacheFile> [inicioSemanaMs]
//   -> JSON { sessions: [{ id, title, w }], weekly: [{ id, title, ww }], titles: { id: title } }
const fs = require('fs')
const path = require('path')
const os = require('os')

const since = Number(process.argv[2]) || Date.now() - 5 * 3600e3
const cacheFile = process.argv[3]
const sinceWeek = Number(process.argv[4]) || 0
// Se guardan los mensajes desde el inicio más antiguo de los dos periodos.
const keepFrom = sinceWeek ? Math.min(since, sinceWeek) : since
const root = path.join(os.homedir(), '.claude', 'projects')
// Versión del caché: la anterior solo guardaba 5 h, así que se relee todo una vez.
const CACHE_V = 2

// USD por millón de tokens: solo importan las proporciones entre modelos.
const PRICE = {
  opus: [5, 25, 0.5, 6.25],
  sonnet: [3, 15, 0.3, 3.75],
  haiku: [1, 5, 0.1, 1.25],
}
const weight = (model, u) => {
  const key = /haiku/.test(model) ? 'haiku' : /sonnet/.test(model) ? 'sonnet' : 'opus'
  const [i, o, r, c] = PRICE[key]
  return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o +
    (u.cache_read_input_tokens || 0) * r + (u.cache_creation_input_tokens || 0) * c) / 1e6
}

// El caché sirve si es de esta versión y guarda mensajes desde antes del periodo pedido.
let cache = {}
try {
  const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  if (raw && raw.v === CACHE_V && raw.keepFrom <= keepFrom) cache = raw.files || {}
} catch {}

const files = []
for (const proj of safeList(root)) {
  const dir = path.join(root, proj)
  for (const name of safeList(dir)) {
    if (name.endsWith('.jsonl')) files.push({ file: path.join(dir, name), sid: name.slice(0, -6), sdir: path.join(dir, name.slice(0, -6)) })
    const sub = path.join(dir, name, 'subagents')
    for (const s of safeList(sub)) {
      if (s.endsWith('.jsonl')) files.push({ file: path.join(sub, s), sid: name, sdir: path.join(dir, name) })
    }
  }
}

const next = {}
for (const { file, sid, sdir } of files) {
  let st
  try { st = fs.statSync(file) } catch { continue }
  if (st.mtimeMs < keepFrom) continue
  const old = cache[file]
  const entry = old && old.size <= st.size ? old : { size: 0, msgs: {}, title: null }
  if (st.size > entry.size) {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(st.size - entry.size)
    fs.readSync(fd, buf, 0, buf.length, entry.size)
    fs.closeSync(fd)
    const text = buf.toString('utf8')
    const lastNl = text.lastIndexOf('\n')
    if (lastNl >= 0) {
      for (const line of text.slice(0, lastNl).split('\n')) parseLine(line, entry)
      entry.size += Buffer.byteLength(text.slice(0, lastNl + 1))
    }
  }
  for (const [id, m] of Object.entries(entry.msgs)) if (m[0] < keepFrom) delete entry.msgs[id]
  entry.sid = sid
  entry.sdir = sdir
  next[file] = entry
}
try { fs.writeFileSync(cacheFile, JSON.stringify({ v: CACHE_V, keepFrom, files: next })) } catch {}

const bySid = {}
for (const e of Object.values(next)) {
  const s = (bySid[e.sid] ??= { id: e.sid, title: null, w: 0, ww: 0 })
  if (e.title) s.title = e.title
  if (!s.dir) {
    s.dir = e.sdir
    try { s.title = JSON.parse(fs.readFileSync(path.join(s.dir, 'custom-title.json'), 'utf8')).customTitle || s.title } catch {}
  }
  for (const m of Object.values(e.msgs)) {
    if (m[0] >= since) s.w += m[1]
    if (sinceWeek && m[0] >= sinceWeek) s.ww += m[1]
  }
}
const all = Object.values(bySid)
const sessions = all.filter(s => s.w > 0).sort((a, b) => b.w - a.w).map(({ id, title, w }) => ({ id, title, w }))
const weekly = all.filter(s => s.ww > 0).sort((a, b) => b.ww - a.ww).map(({ id, title, ww }) => ({ id, title, ww }))
// Título de toda sesión con registro reciente, aunque no haya gastado nada en el periodo.
const titles = {}
for (const s of all) if (s.title) titles[s.id] = s.title
process.stdout.write(JSON.stringify({ sessions, weekly, titles }))

function parseLine(line, entry) {
  if (!line.includes('"usage"') && !line.includes('-title"')) return
  let j
  try { j = JSON.parse(line) } catch { return }
  if (j.type === 'custom-title' && j.customTitle) entry.title = j.customTitle
  else if (j.type === 'ai-title' && j.aiTitle && !entry.hasCustom) entry.title = j.aiTitle
  if (j.type === 'custom-title') entry.hasCustom = true
  const m = j.message
  if (j.type !== 'assistant' || !m || !m.usage || !m.id) return
  const ts = Date.parse(j.timestamp)
  if (!(ts >= keepFrom)) return
  entry.msgs[m.id] = [ts, weight(m.model || '', m.usage)]
}

function safeList(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}
