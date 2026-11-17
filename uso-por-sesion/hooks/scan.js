// Reparte el consumo entre sesiones leyendo ~/.claude/projects: el del bloque de 5 h y el de la semana.
// Uso: node scan.js <inicioBloqueMs> <cacheFile> [inicioSemanaMs]
//   -> JSON { sessions: [{ id, title, w }], weekly: [{ id, title, ww }], titles: { id: title }, usd: { block, week } }
// Costo de un periodo cualquiera (semanas pasadas, sin caché): node scan.js cost <desdeMs> <hastaMs> -> JSON { usd }
// w, ww y usd están en USD a precios de lista de la API (estimación: no incluye herramientas de servidor).
const fs = require('fs')
const path = require('path')
const os = require('os')

const root = path.join(os.homedir(), '.claude', 'projects')
// Versión del caché: cambia cuando cambia lo guardado o los precios, y entonces se relee todo una vez.
const CACHE_V = 5
// Se lee de a trozos para no cargar en memoria un registro grande completo.
const CHUNK = 8 * 1024 * 1024
// Bytes del inicio de cada registro guardados para notar si el archivo se reescribió.
const HEAD = 256

// USD por millón de tokens [entrada, salida, lectura de caché, escritura de caché 5 min], por modelo.
// La escritura de caché de 1 h (la que usa Claude Code) cuesta el doble de la entrada.
// El primero que calce gana; un modelo desconocido usa el precio de Opus.
const PRICES = [
  [/fable-5-2|mythos-5-2/, [8, 40, 0.2, 10]],
  [/fable|mythos/, [10, 50, 1, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet-5-5/, [2, 10, 0.1, 2.5]],
  [/sonnet-5/, [2, 10, 0.2, 2.5]],
  [/sonnet/, [3, 15, 0.3, 3.75]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.125]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]
const weight = (model, u) => {
  const [i, o, r, c] = (PRICES.find(([re]) => re.test(model)) || [0, [5, 25, 0.5, 6.25]])[1]
  const write1h = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0
  const write5m = Math.max(0, (u.cache_creation_input_tokens || 0) - write1h)
  return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o +
    (u.cache_read_input_tokens || 0) * r + write5m * c + write1h * i * 2) / 1e6
}

if (process.argv[2] === 'cost') costMode(Number(process.argv[3]), Number(process.argv[4]))

const since = Number(process.argv[2]) || Date.now() - 5 * 3600e3
const cacheFile = process.argv[3]
const sinceWeek = Number(process.argv[4]) || 0

// El caché sirve si es de esta versión y guarda mensajes desde antes del periodo pedido.
// Sin inicio de semana (dato que a veces falta) se conserva lo ya guardado en vez de descartarlo.
let raw = null
try { raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch {}
const valid = raw && raw.v === CACHE_V
const keepFrom = sinceWeek ? Math.min(since, sinceWeek) : Math.min(since, valid ? raw.keepFrom : since)
const cache = valid && raw.keepFrom <= keepFrom ? raw.files || {} : {}

const files = []
for (const proj of safeList(root)) {
  const dir = path.join(root, proj)
  for (const name of safeList(dir)) files.push(...sessionFiles(dir, name))
}

const next = {}
const stale = {}
for (const { file, sid, sdir, main } of files) {
  let st
  try { st = fs.statSync(file) } catch { continue }
  // Registro sin cambios en el periodo (sesión abierta pero quieta): no se lee, solo se toma su título renombrado.
  if (st.mtimeMs < keepFrom) {
    if (main) try { stale[sid] = JSON.parse(fs.readFileSync(path.join(sdir, 'custom-title.json'), 'utf8')).customTitle } catch {}
    continue
  }
  const head = readHead(file)
  const old = cache[file]
  // Un archivo más corto o con otro comienzo se reescribió: se lee de nuevo desde cero.
  const entry = old && old.size <= st.size && old.head === head ? old : { size: 0, msgs: {}, title: null, born: Infinity, head }
  if (st.size > entry.size) {
    entry.size = readLines(file, entry.size, st.size, line => parseLine(line, entry, keepFrom))
  }
  for (const [id, m] of Object.entries(entry.msgs)) if (m[0] < keepFrom) delete entry.msgs[id]
  entry.sid = sid
  entry.sdir = sdir
  entry.main = main
  next[file] = entry
}
try { fs.writeFileSync(cacheFile, JSON.stringify({ v: CACHE_V, keepFrom, files: next })) } catch {}

// Un mismo mensaje puede aparecer en varios registros (una sesión retomada o bifurcada copia los anteriores):
// se cuenta una sola vez, para el registro que nació primero (el original).
const owner = {}
for (const e of Object.values(next)) {
  for (const id of Object.keys(e.msgs)) {
    const cur = owner[id]
    if (!cur || e.born < cur.born || (e.born === cur.born && e.main && !cur.main)) owner[id] = e
  }
}

const bySid = {}
for (const e of Object.values(next)) {
  const s = (bySid[e.sid] ??= { id: e.sid, title: null, w: 0, ww: 0 })
  // El título es el de la sesión, no el de sus subagentes.
  if (e.title && e.main) s.title = e.title
  if (!s.dir) {
    s.dir = e.sdir
    try { s.title = JSON.parse(fs.readFileSync(path.join(s.dir, 'custom-title.json'), 'utf8')).customTitle || s.title } catch {}
  }
  for (const [id, m] of Object.entries(e.msgs)) {
    if (owner[id] !== e) continue
    if (m[0] >= since) s.w += m[1]
    if (sinceWeek && m[0] >= sinceWeek) s.ww += m[1]
  }
}
const all = Object.values(bySid)
const sessions = all.filter(s => s.w > 0).sort((a, b) => b.w - a.w).map(({ id, title, w }) => ({ id, title, w }))
const weekly = all.filter(s => s.ww > 0).sort((a, b) => b.ww - a.ww).map(({ id, title, ww }) => ({ id, title, ww }))
// Título de toda sesión con registro reciente, aunque no haya gastado nada en el periodo.
const titles = {}
for (const [id, t] of Object.entries(stale)) if (t) titles[id] = t
for (const s of all) if (s.title) titles[s.id] = s.title
const usd = { block: all.reduce((a, s) => a + s.w, 0), week: all.reduce((a, s) => a + s.ww, 0) }
process.stdout.write(JSON.stringify({ sessions, weekly, titles, usd }))

function parseLine(line, entry, from) {
  if (!line.includes('"usage"') && !line.includes('-title"')) return
  let j
  try { j = JSON.parse(line) } catch { return }
  if (j.type === 'custom-title' && j.customTitle) entry.title = j.customTitle
  else if (j.type === 'ai-title' && j.aiTitle && !entry.hasCustom) entry.title = j.aiTitle
  if (j.type === 'custom-title') entry.hasCustom = true
  const m = j.message
  if (j.type !== 'assistant' || !m || !m.usage || !m.id) return
  const ts = Date.parse(j.timestamp)
  if (ts < entry.born) entry.born = ts
  if (!(ts >= from)) return
  entry.msgs[m.id] = [ts, weight(m.model || '', m.usage)]
}

// Lee las líneas completas entre dos posiciones, de a trozos; devuelve hasta dónde leyó
// (una última línea sin salto queda para la próxima vez). Corta solo en '\n', así nunca parte un carácter.
function readLines(file, start, end, onLine) {
  let fd
  try { fd = fs.openSync(file, 'r') } catch { return start }
  let pos = start, carry = Buffer.alloc(0), done = start
  try {
    while (pos < end) {
      const buf = Buffer.alloc(Math.min(CHUNK, end - pos))
      const n = fs.readSync(fd, buf, 0, buf.length, pos)
      if (n <= 0) break
      pos += n
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n)
      const last = data.lastIndexOf(10)
      if (last < 0) { carry = data; continue }
      for (const line of data.subarray(0, last).toString('utf8').split('\n')) onLine(line)
      done = pos - (data.length - last - 1)
      carry = data.subarray(last + 1)
    }
  } finally { fs.closeSync(fd) }
  return done
}

function readHead(file) {
  try {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(HEAD)
    const n = fs.readSync(fd, buf, 0, HEAD, 0)
    fs.closeSync(fd)
    return buf.subarray(0, n).toString('base64')
  } catch { return '' }
}

// Todos los registros de una sesión: el principal y, bajo su carpeta, los de subagentes y workflows
// (a cualquier profundidad), para que su gasto cuente para la sesión que los lanzó.
function sessionFiles(dir, name) {
  const out = []
  if (!name.endsWith('.jsonl')) return out
  const sid = name.slice(0, -6), sdir = path.join(dir, sid)
  out.push({ file: path.join(dir, name), sid, sdir, main: true })
  const walk = d => {
    for (const n of safeList(d)) {
      const p = path.join(d, n)
      if (n.endsWith('.jsonl')) out.push({ file: p, sid, sdir, main: false })
      else if (!n.includes('.')) walk(p)
    }
  }
  walk(sdir)
  return out
}

function safeList(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}

// Suma el costo de los mensajes entre dos fechas leyendo todos los registros modificados desde entonces.
function costMode(from, to) {
  const seen = new Set()
  let usd = 0
  for (const proj of safeList(root)) {
    const dir = path.join(root, proj)
    for (const name of safeList(dir)) {
      for (const { file } of sessionFiles(dir, name)) {
        let st
        try { st = fs.statSync(file) } catch { continue }
        if (st.mtimeMs < from) continue
        readLines(file, 0, st.size, line => {
          if (!line.includes('"usage"')) return
          let j
          try { j = JSON.parse(line) } catch { return }
          const m = j.message
          if (j.type !== 'assistant' || !m || !m.usage || !m.id || seen.has(m.id)) return
          const ts = Date.parse(j.timestamp)
          if (!(ts >= from && ts < to)) return
          seen.add(m.id)
          usd += weight(m.model || '', m.usage)
        })
      }
    }
  }
  process.stdout.write(JSON.stringify({ usd }))
  process.exit(0)
}
