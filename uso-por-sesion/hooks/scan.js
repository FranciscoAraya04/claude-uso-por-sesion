// Reparte el consumo del bloque de 5 h entre sesiones leyendo ~/.claude/projects.
// Uso: node scan.js <inicioBloqueMs> <cacheFile>  -> JSON { sessions: [{ id, title, w }] }
const fs = require('fs')
const path = require('path')
const os = require('os')

const since = Number(process.argv[2]) || Date.now() - 5 * 3600e3
const cacheFile = process.argv[3]
const root = path.join(os.homedir(), '.claude', 'projects')

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

let cache = {}
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch {}

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
  if (st.mtimeMs < since) continue
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
  for (const [id, m] of Object.entries(entry.msgs)) if (m[0] < since) delete entry.msgs[id]
  entry.sid = sid
  entry.sdir = sdir
  next[file] = entry
}
try { fs.writeFileSync(cacheFile, JSON.stringify(next)) } catch {}

const bySid = {}
for (const e of Object.values(next)) {
  const s = (bySid[e.sid] ??= { id: e.sid, title: null, w: 0 })
  if (e.title) s.title = e.title
  if (!s.dir) {
    s.dir = e.sdir
    try { s.title = JSON.parse(fs.readFileSync(path.join(s.dir, 'custom-title.json'), 'utf8')).customTitle || s.title } catch {}
  }
  for (const m of Object.values(e.msgs)) s.w += m[1]
}
const sessions = Object.values(bySid).filter(s => s.w > 0).sort((a, b) => b.w - a.w)
process.stdout.write(JSON.stringify({ sessions }))

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
  if (!(ts >= since)) return
  entry.msgs[m.id] = [ts, weight(m.model || '', m.usage)]
}

function safeList(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}
