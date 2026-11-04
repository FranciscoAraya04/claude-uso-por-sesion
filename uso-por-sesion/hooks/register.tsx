import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { BrakeTest, HistoryBlock, Snapshot } from '../types'

const snapshot = atom({ plugin: 'uso-por-sesion', key: 'snapshot' } as const, null)
const isOpen = atom({ plugin: 'uso-por-sesion', key: 'isOpen' } as const, false)
const isMin = atom({ plugin: 'uso-por-sesion', key: 'isMin' } as const, false)
const nowMs = atom({ plugin: 'uso-por-sesion', key: 'nowMs' } as const, 0)
const status = atom({ plugin: 'uso-por-sesion', key: 'status' } as const, 'Calculando uso…')

const test = atom({ plugin: 'uso-por-sesion', key: 'test' } as const, null as BrakeTest | null)
const resumeAt = atom({ plugin: 'uso-por-sesion', key: 'resumeAt' } as const, 0)
const isBraked = atom({ plugin: 'uso-por-sesion', key: 'isBraked' } as const, false)
// Por qué se detuvo esta sesión mientras trabajaba ('' = no detenida); al liberarse, se reanuda sola.
// Bloque (resetsAt) en que ya se avisó que esta sesión se acerca a su tope.
const warnedFor = atom({ plugin: 'uso-por-sesion', key: 'warnedFor' } as const, '')
// Sesión elegida en el selector del desglose ('' = esta sesión).
const selected = atom({ plugin: 'uso-por-sesion', key: 'selected' } as const, '')
const histRange = atom({ plugin: 'uso-por-sesion', key: 'histRange' } as const, 'semana')
const histSession = atom({ plugin: 'uso-por-sesion', key: 'histSession' } as const, '')
const cfgTab = atom({ plugin: 'uso-por-sesion', key: 'cfgTab' } as const, 'ajustes')
// Sesión cuyo botón ∞ espera el segundo toque de confirmación ('' = ninguna).
const armed = atom({ plugin: 'uso-por-sesion', key: 'armed' } as const, '')
const stoppedBy = atom({ plugin: 'uso-por-sesion', key: 'stoppedBy' } as const, '')

const FIVE_HOURS = 5 * 3600e3
// Terracota de Claude para sesiones ∞ (el tema de la app no lo expone en la franja).
const CLAY = '#d97757'
// Freno: al 83 % del bloque se detiene todo; el 2 % restante alcanza para cerrar ordenado.
// Ajustes de cada persona, guardados en el almacén compartido; estos son los valores por defecto.
const DEFAULTS = { brakeAt: 83, closeMargin: 2, marginMin: 2, defaultCap: 35, warnPct: 80, maxBypass: 1 }
type Cfg = typeof DEFAULTS
const CFG_KEY = 'config'
let CFG: Cfg = { ...DEFAULTS }
const resumeMargin = () => CFG.marginMin * 60000

async function loadCfg($: { store: { get: (k: string) => Promise<unknown> } }) {
  const raw = await $.store.get(CFG_KEY)
  CFG = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? (raw as Partial<Cfg>) : {}) }
  return CFG
}
const APPROVED_KEY = 'freno-aprobado'
const RESUME_TEXT: Record<string, string> = {
  freno: 'El bloque de 5 horas se restableció (freno de uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
  tope: 'El bloque de 5 horas se restableció o se liberó el tope de esta sesión (uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
  pausa: 'Esta sesión fue reanudada (uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
}
const capKey = (id: string) => `tope:${id}`
// Tope por defecto de toda sesión; 0 guardado = sin tope.
const CAP_STEP = 10
const HISTORY_KEY = 'historial'
const HISTORY_PANE = 'uso-config'
const SEVEN_DAYS = 7 * 24 * 3600e3

async function capOf($: { store: { get: (k: string) => Promise<unknown> } }, id: string) {
  const v = await $.store.get(capKey(id))
  if (v === 0) return undefined
  if (typeof v === 'number') return v
  return CFG.defaultCap > 0 ? CFG.defaultCap : undefined
}
const capOkKey = (id: string) => `tope-ok:${id}`
const pauseKey = (id: string) => `pausa:${id}`
// Sesión que ignora el freno global hasta el reinicio guardado (resetsAt).
const bypassKey = (id: string) => `sinfreno:${id}`
const brakeOkKey = (id: string) => `freno-ok:${id}`

const hhmm = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const px = (n: number, width: number) => Math.max(0, Math.min(width, Math.round((n / 100) * width)))

const svgBar = (width: number, mine: number, rest: number, mineColor: string, cap?: number) => {
  const h = 6
  const r = h / 2
  const a = Math.max(0, Math.min(width, (mine / 100) * width))
  const b = Math.max(0, Math.min(width - a, (rest / 100) * width))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">` +
    '<style>.bg{fill:#3a3936}.rest{fill:#7d7b74}.cap{fill:#f5f5f4}' +
    '@media (prefers-color-scheme: light){.bg{fill:#e4e2db}.rest{fill:#a19f97}.cap{fill:#2b2a27}}</style>' +
    `<clipPath id="c"><rect width="${width}" height="${h}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#c)"><rect class="bg" width="${width}" height="${h}"/>` +
    `<rect class="rest" width="${(a + b).toFixed(1)}" height="${h}"/>` +
    `<rect width="${a.toFixed(1)}" height="${h}" fill="${mineColor}"/></g>` +
    (cap === undefined ? '' : `<rect x="${Math.max(0, Math.min(width - 2, (cap / 100) * width - 1)).toFixed(1)}" width="2" height="${h}" class="cap"/>`) +
    '</svg>'
}

const left = (iso: string | null, now: number) => {
  if (!iso || !now) return hhmm(iso)
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`
}

// Color del ritmo: proyecta a qué hora llegarías al 100 % con el ritmo actual del bloque.
const paceColor = (pct: number, iso: string | null, now: number, windowMs = FIVE_HOURS) => {
  if (!iso || !now) return undefined
  const reset = Date.parse(iso)
  const elapsed = now - (reset - windowMs)
  const unit = windowMs / 5
  const remaining = reset - now
  if (elapsed < windowMs / 30 || pct <= 0) return undefined
  const projected = pct + (pct / elapsed) * remaining
  if (projected <= 85) return '#4ade80'
  if (projected <= 100) return '#facc15'
  const short = remaining - ((100 - pct) / pct) * elapsed
  if (short < unit) return '#fb923c'
  if (short < 2 * unit) return '#ef4444'
  if (short < 3 * unit) return '#a855f7'
  return '#7c3aed'
}

const BLINKS = ['#ef4444', '#a855f7', '#7c3aed']
const dotSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="${color}">` +
  (BLINKS.includes(color) ? '<animate attributeName="opacity" values="1;0.15;1" dur="1.2s" repeatCount="indefinite"/>' : '') +
  '</circle></svg>'

type $T = Parameters<Hook<'turn.complete'>>[0]

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#a855f7', '#ef4444', '#84cc16']
const colorOf = (title: string) => {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const shortDay = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Bucket = { label: string; tip: string; total: number; parts: { title: string; pct: number }[] }

// Agrupa el historial según el periodo: bloques (semana), días (mes), semanas (año) o meses (histórico).
// Fuera de "semana" el valor es la suma de % de bloque: 150 % = un bloque y medio gastado.
function bucketize(all: HistoryBlock[], range: string, who: string): { buckets: Bucket[]; unit: string } {
  const now = Date.now()
  const days = range === 'semana' ? 7 : range === 'mes' ? 31 : range === 'año' ? 366 : Infinity
  const list = all.filter(b => now - Date.parse(b.resetsAt) < days * 86400e3).slice().reverse()
  const pick = (b: HistoryBlock) => (who ? b.top.filter(t => t.title === who) : b.top)
  const value = (b: HistoryBlock) => (who ? pick(b).reduce((a, t) => a + t.pct, 0) : b.pct)
  if (range === 'semana') {
    return {
      unit: who ? `Bloques de 5 h · % del límite usado por ${who}` : 'Bloques de 5 h · % del límite',
      buckets: list.map(b => ({
        label: shortDay(b.resetsAt),
        tip: `${shortDay(b.resetsAt)} ${hhmm(new Date(Date.parse(b.resetsAt) - FIVE_HOURS).toISOString())}–${hhmm(b.resetsAt)} · ${fmt(value(b))} %`,
        total: value(b),
        parts: pick(b),
      })),
    }
  }
  const keyOf = (iso: string) => {
    const d = new Date(iso)
    if (range === 'mes') return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (range === 'año') {
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
    }
    return `${d.getFullYear()}-${d.getMonth()}`
  }
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const groups = new Map<string, Bucket>()
  for (const b of list) {
    const k = keyOf(b.resetsAt)
    const d = new Date(b.resetsAt)
    const label = range === 'todo' ? `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : range === 'año' ? `sem ${shortDay(b.resetsAt)}` : shortDay(b.resetsAt)
    const g = groups.get(k) ?? { label, tip: '', total: 0, parts: [] }
    g.total += value(b)
    if (range === 'mes') {
      for (const t of pick(b)) {
        const prev = g.parts.find(x => x.title === t.title)
        if (prev) prev.pct += t.pct
        else g.parts.push({ ...t })
      }
    }
    groups.set(k, g)
  }
  const buckets = [...groups.values()].map(g => ({
    ...g,
    parts: g.parts.sort((a, b) => b.pct - a.pct).slice(0, 5),
    tip: `${g.label} · ${fmt(g.total)} % de bloque (≈ ${fmt(g.total / 100)} bloques)`,
  }))
  const per = range === 'mes' ? 'día' : range === 'año' ? 'semana' : 'mes'
  return { unit: `Uso por ${per} · suma de % de bloque${who ? ` de ${who}` : ''}`, buckets }
}

// Barras apiladas: cada sesión con su color, el resto en gris; con freno, línea al 83 %.
function historyChart(list: Bucket[], width: number, showBrake: boolean) {
  const h = 210, top = 10, bottom = 34, left = 34, plot = h - top - bottom
  const max = Math.max(100, ...list.map(b => b.total))
  const step = (width - left - 8) / list.length
  const bw = Math.max(4, Math.min(28, step * 0.7))
  const y = (pct: number) => top + plot - (Math.min(max, pct) / max) * plot
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" font-family="sans-serif" font-size="10">`
  for (const g of [0, max / 2, max]) {
    out += `<line x1="${left}" x2="${width - 4}" y1="${y(g)}" y2="${y(g)}" stroke="#3a3936" stroke-width="1"/><text x="${left - 4}" y="${y(g) + 3}" fill="#8f8d85" text-anchor="end">${Math.round(g)}</text>`
  }
  const legend = new Map<string, string>()
  list.forEach((b, i) => {
    const x = left + i * step + (step - bw) / 2
    let acc = 0
    let tip = b.tip
    const seg = (pct: number, color: string) => {
      const y0 = y(acc), y1 = y(acc + pct)
      out += `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="${color}"/>`
      acc += pct
    }
    out += '<g>'
    for (const t of b.parts) {
      const c = colorOf(t.title)
      legend.set(t.title, c)
      seg(t.pct, c)
      tip += `\n${fmt(t.pct)} % ${t.title}`
    }
    seg(Math.max(0, b.total - acc), '#5f5e5a')
    out += `<title>${esc(tip)}</title></g>`
    if (i % Math.ceil(list.length / 8) === 0) {
      out += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - bottom + 14}" fill="#8f8d85" text-anchor="middle">${esc(b.label)}</text>`
    }
  })
  if (showBrake) out += `<line x1="${left}" x2="${width - 4}" y1="${y(83)}" y2="${y(83)}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 3"/>`
  let lx = left
  for (const [title, c] of [...legend].slice(0, 4)) {
    const label = title.length > 22 ? `${title.slice(0, 21)}…` : title
    out += `<rect x="${lx}" y="${h - 10}" width="8" height="8" rx="2" fill="${c}"/><text x="${lx + 11}" y="${h - 3}" fill="#c8c6bd">${esc(label)}</text>`
    lx += 14 + label.length * 5.6
    if (lx > width - 60) break
  }
  return out + '</svg>'
}

// Línea del uso semanal, un punto por bloque.
function weeklyChart(list: HistoryBlock[], width: number) {
  const h = 120, top = 10, bottom = 18, left = 30, plot = h - top - bottom
  const pts = list.map((b, i) => ({ i, v: b.weekly })).filter((p): p is { i: number; v: number } => p.v !== null)
  const step = (width - left - 8) / Math.max(1, list.length - 1)
  const x = (i: number) => left + i * step
  const y = (pct: number) => top + plot - (Math.min(100, pct) / 100) * plot
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" font-family="sans-serif" font-size="10">`
  for (const g of [0, 50, 100]) {
    out += `<line x1="${left}" x2="${width - 4}" y1="${y(g)}" y2="${y(g)}" stroke="#3a3936" stroke-width="1"/><text x="${left - 4}" y="${y(g) + 3}" fill="#8f8d85" text-anchor="end">${g}</text>`
  }
  if (pts.length) {
    const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
    out += `<path d="${path} L${x(pts[pts.length - 1]!.i).toFixed(1)},${y(0)} L${x(pts[0]!.i).toFixed(1)},${y(0)} Z" fill="#a855f7" opacity="0.15"/>`
    out += `<path d="${path}" fill="none" stroke="#a855f7" stroke-width="2"/>`
    for (const p of pts) out += `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="#a855f7"><title>${shortDay(list[p.i]!.resetsAt)} · semanal ${fmt(p.v)} %</title></circle>`
  }
  return out + '</svg>'
}

const leftShort = (iso: string | null, now: number) => left(iso, now).replace(' min', ' m')

// Mismo bloque de 5 h: la hora de reinicio que informa la API varía unos segundos entre respuestas.
const sameBlock = (a: unknown, b: string | null | undefined) =>
  typeof a === 'string' && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 30 * 60000

const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString()).replace('.', ',')

async function refresh($: $T) {
  const usage = await $.session.usage()
  const five = usage.rateLimits.find(r => r.kind === 'five_hour')
  if (!five) {
    await update($, status, () => `Sin dato de 5 h aún (${usage.rateLimits.map(r => r.kind).join(', ') || 'vacío'})`)
    return
  }
  const week = usage.rateLimits.find(r => r.kind === 'seven_day')
  const now = await $.clock.now()
  const since = five.resetsAt ? Date.parse(five.resetsAt) - FIVE_HOURS : now - FIVE_HOURS
  const root = $.plugin.root
  const { exitCode, stdout, stderr } = await $.process.run(
    ['node', `${root}/hooks/scan.js`, String(since), `${root}/.scan-cache.json`],
    { timeoutMs: 60000 },
  )
  if (exitCode !== 0) {
    await update($, status, () => `Error al leer registros: ${stderr.slice(0, 120)}`)
    return
  }
  const { sessions } = JSON.parse(stdout) as { sessions: { id: string; title: string | null; w: number }[] }
  const total = sessions.reduce((s, x) => s + x.w, 0) || 1
  const me = await $.session.id()
  const extra = async (id: string) => {
    const cap = await capOf($, id)
    return {
      ...(cap !== undefined ? { cap } : {}),
      ...((await $.store.get(pauseKey(id))) ? { paused: true } : {}),
      ...(five.resetsAt && sameBlock(await $.store.get(bypassKey(id)), five.resetsAt) ? { bypass: true } : {}),
    }
  }
  const shares = await Promise.all(sessions.map(async s => ({
    id: s.id,
    title: s.title ?? s.id.slice(0, 8),
    pct: (s.w / total) * five.percentUsed,
    ...(await extra(s.id)),
  })))
  if (!shares.some(s => s.id === me)) shares.push({ id: me, title: 'Esta sesión', pct: 0, ...(await extra(me)) })
  const next: Snapshot = {
    fiveHour: five.percentUsed,
    resetsAt: five.resetsAt ?? null,
    weekly: week?.percentUsed ?? null,
    weeklyResetsAt: week?.resetsAt ?? null,
    current: shares.find(s => s.id === me)?.pct ?? 0,
    sessions: shares.slice(0, 8),
  }
  await update($, snapshot, () => next)
  if (next.resetsAt) await recordHistory($, next)
  await warnNearCap($, next)
}

// Guarda el bloque actual en el historial (uno por reinicio, se queda con el máximo visto).
async function recordHistory($: $T, snap: Snapshot) {
  const raw = await $.store.get(HISTORY_KEY)
  const list = Array.isArray(raw) ? (raw as HistoryBlock[]) : []
  const block: HistoryBlock = {
    resetsAt: snap.resetsAt!,
    pct: snap.fiveHour,
    weekly: snap.weekly,
    top: snap.sessions.filter(s => s.pct > 0).slice(0, 8).map(s => ({ title: s.title, pct: s.pct })),
  }
  const old = list.find(b => b.resetsAt === block.resetsAt)
  if (old && old.pct > block.pct) return
  const nextList = [...list.filter(b => b.resetsAt !== block.resetsAt), block]
    .sort((a, b) => Date.parse(b.resetsAt) - Date.parse(a.resetsAt))
    .slice(0, 2600)
  await $.store.set(HISTORY_KEY, nextList)
}

// Un aviso por bloque cuando esta sesión pasa el 80 % de su tope.
async function warnNearCap($: $T, snap: Snapshot) {
  const me = await $.session.id()
  const cap = snap.sessions.find(s => s.id === me)?.cap
  if (cap === undefined || !snap.resetsAt || snap.current < cap * (CFG.warnPct / 100)) return
  if (sameBlock(await read($, warnedFor), snap.resetsAt)) return
  await update($, warnedFor, () => snap.resetsAt!)
  $.ui.toast(`Esta sesión va en ${fmt(snap.current)} % del bloque: cerca de su tope de ${fmt(cap)} %.`)
}

// Sube o baja el tope de una sesión de a 10 %; bajo 10 queda sin tope.
// Corrige una fila del desglose al instante; el recálculo completo llega después.
async function patchRow($: $T, id: string, fn: (s: Snapshot['sessions'][number]) => Snapshot['sessions'][number]) {
  await update($, snapshot, snap => (snap ? { ...snap, sessions: snap.sessions.map(s => (s.id === id ? fn(s) : s)) } : snap))
}

async function stepCap($: $T, id: string, dir: 1 | -1) {
  const cur = await capOf($, id)
  const base = cur ?? 100
  const n = Math.round((base + dir * CAP_STEP) / CAP_STEP) * CAP_STEP
  const next = n <= 0 ? 0 : Math.min(100, n)
  await $.store.set(capKey(id), next)
  await $.store.delete(capOkKey(id))
  await patchRow($, id, s => {
    const { cap: _old, ...rest } = s
    return next > 0 ? { ...rest, cap: next } : rest
  })
  void refresh($).catch(() => {})
  await syncStop($)
}

async function limit($: $T) {
  const t = await read($, test)
  if (t) return { pct: t.pct, resetsAt: t.resetsAt }
  const five = (await $.session.usage()).rateLimits.find(r => r.kind === 'five_hour')
  return five?.resetsAt ? { pct: five.percentUsed, resetsAt: five.resetsAt } : null
}

// Qué detiene a esta sesión ahora: una pausa, el freno global o su tope propio.
async function stopReason($: $T): Promise<{ kind: string; text: string } | null> {
  const me = await $.session.id()
  if (await $.store.get(pauseKey(me))) {
    return { kind: 'pausa', text: 'Sesión pausada con /uso-pausar. Se reanuda con /uso-reanudar.' }
  }
  const l = await limit($)
  if (!l || Date.parse(l.resetsAt) + resumeMargin() <= Date.now()) return null
  const resumeAt = hhmm(new Date(Date.parse(l.resetsAt) + resumeMargin()).toISOString())
  const bypass = sameBlock(await $.store.get(bypassKey(me)), l.resetsAt)
  if (bypass && l.pct >= 100 - CFG.closeMargin) {
    return { kind: 'freno', text: `Límite real cerca: el bloque de 5 h va en ${fmt(l.pct)} % y esta sesión (sin freno global) se detiene antes del corte de Anthropic. Se reanuda sola a las ${resumeAt}.` }
  }
  const brakeOk = bypass || sameBlock(await $.store.get(APPROVED_KEY), l.resetsAt) || sameBlock(await $.store.get(brakeOkKey(me)), l.resetsAt)
  if (l.pct >= CFG.brakeAt && !brakeOk) {
    const free = ((await read($, snapshot))?.sessions ?? []).filter(s => s.bypass).map(s => s.title)
    return { kind: 'freno', text: `Freno de uso: el bloque de 5 h va en ${fmt(l.pct)} % (freno ${CFG.brakeAt} %).${free.length ? ` Sigue sin freno: ${free.join(', ')}.` : ''} Se reanuda sola a las ${resumeAt}; /uso-continuar la libera antes.` }
  }
  const cap = await capOf($, me)
  const mine = (await read($, snapshot))?.current ?? 0
  if (cap !== undefined && mine >= Math.max(0, cap - CFG.closeMargin) && !sameBlock(await $.store.get(capOkKey(me)), l.resetsAt)) {
    return { kind: 'tope', text: `Tope de esta sesión: lleva ${fmt(mine)} % del bloque de 5 h (tope ${fmt(cap)} %). Se reanuda sola tras el reinicio; /uso-continuar la libera antes.` }
  }
  return null
}

async function syncStop($: $T) {
  const r = await stopReason($)
  const braked = r !== null
  if (braked !== (await read($, isBraked))) await update($, isBraked, () => braked)
  const l = await limit($)
  const at = r && r.kind !== 'pausa' && l ? Date.parse(l.resetsAt) + resumeMargin() : 0
  if (at !== (await read($, resumeAt))) await update($, resumeAt, () => at)
  return r
}

// Cada minuto: si esta sesión se detuvo trabajando y ya nada la frena, retoma la tarea.
async function maybeResume($: $T) {
  const was = await read($, stoppedBy)
  if (!was || (await syncStop($))) return
  await update($, stoppedBy, () => '')
  await update($, test, () => null)
  await $.prompt.submit({ text: RESUME_TEXT[was] ?? RESUME_TEXT.pausa! })
}

// Pausa o reanuda una sesión desde los botones del desglose.
async function setPaused($: $T, id: string, paused: boolean) {
  if (paused) await $.store.set(pauseKey(id), true)
  else await $.store.delete(pauseKey(id))
  await patchRow($, id, s => ({ ...s, paused }))
  void refresh($).catch(() => {})
  await maybeResume($)
  await syncStop($)
}

// Activa o quita el ∞ (sin freno global) de una sesión: hasta CFG.maxBypass a la vez, con un segundo toque para confirmar.
async function toggleBypass($: $T, id: string) {
  // Usa el reinicio del snapshot: desde un botón, leer el uso de la sesión puede no estar permitido.
  const snap = await read($, snapshot)
  const t = await read($, test)
  const l = t ? { resetsAt: t.resetsAt } : snap?.resetsAt ? { resetsAt: snap.resetsAt } : await limit($).catch(() => null)
  if (!l) return void $.ui.toast('Aún no hay dato del bloque de 5 h.')
  const list = snap?.sessions ?? []
  const title = list.find(s => s.id === id)?.title ?? 'esta sesión'
  if (sameBlock(await $.store.get(bypassKey(id)), l.resetsAt)) {
    await $.store.delete(bypassKey(id))
    await update($, armed, () => '')
    await patchRow($, id, s => ({ ...s, bypass: false }))
    void refresh($).catch(() => {})
    await syncStop($)
    $.ui.toast(`${title} vuelve a respetar el freno global.`)
    return
  }
  const active = list.filter(s => s.bypass && s.id !== id)
  if (CFG.maxBypass <= 0) return void $.ui.toast('Sin freno global está desactivado en Configuración.')
  if (active.length >= CFG.maxBypass) {
    return void $.ui.toast(`Ya ${active.length === 1 ? 'hay 1 sesión' : `hay ${active.length} sesiones`} sin freno: ${active.map(s => s.title).join(', ')}. Desactívala primero.`)
  }
  if ((await read($, armed)) !== id) {
    await update($, armed, () => id)
    $.ui.toast(`${title} podrá seguir pasado el ${CFG.brakeAt} % y agotar el bloque; las demás se frenarán. Se detiene en ${100 - CFG.closeMargin} % para cerrar ordenada. Toca ∞ de nuevo para confirmar.`)
    $.clock.after(10000, () => void read($, armed).then(a => (a === id ? update($, armed, () => '') : undefined)))
    return
  }
  await update($, armed, () => '')
  await $.store.set(bypassKey(id), l.resetsAt)
  await patchRow($, id, s => ({ ...s, bypass: true }))
  void refresh($).catch(() => {})
  await syncStop($)
  await maybeResume($)
  $.ui.toast(`${title} queda sin freno global hasta el reinicio de las ${hhmm(l.resetsAt)}.`)
}

// Sesiones de la última lista del desglose: un número (1, 2…), "todas" o vacío (esta sesión).
async function targets($: $T, arg: string) {
  const me = await $.session.id()
  const list = (await read($, snapshot))?.sessions ?? []
  const a = arg.trim().toLowerCase()
  if (!a) return [{ id: me, title: 'esta sesión' }]
  if (a === 'todas') return list.map(s => ({ id: s.id, title: s.title }))
  const n = Number(a)
  const s = list[n - 1]
  return Number.isInteger(n) && s ? [{ id: s.id, title: s.title }] : []
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'uso', description: 'Muestra u oculta la franja de uso por sesión' })
    await $.command.register({ name: 'uso-continuar', description: 'Libera freno y tope de esta sesión, la n° del desglose o todas, hasta el reinicio', argumentHint: '[n° | todas]' })
    await $.command.register({ name: 'uso-prueba-freno', description: 'Simula el freno en esta sesión (repite para terminar la prueba)' })
    await $.command.register({ name: 'uso-config', description: 'Abre la configuración: ajustes, historial y ayuda' })
    await $.command.register({ name: 'uso-sin-freno', description: 'Activa o quita el ∞ (ignorar freno global) de esta sesión o la n° del desglose', argumentHint: '[n°]' })
    await $.command.register({ name: 'uso-historial', description: 'Abre el historial de bloques de 5 h en un panel aparte' })
    await $.command.register({ name: 'uso-limite', description: 'Tope de esta sesión en % del bloque de 5 h', argumentHint: '<n> | quitar' })
    await $.command.register({ name: 'uso-pausar', description: 'Pausa esta sesión, la n° del desglose o todas', argumentHint: '[n° | todas]' })
    await $.command.register({ name: 'uso-reanudar', description: 'Reanuda esta sesión, la n° del desglose o todas', argumentHint: '[n° | todas]' })
    await loadCfg($)
    await update($, nowMs, () => Date.now())
    $.clock.every(60000, async () => {
      await loadCfg($)
      await update($, nowMs, () => Date.now())
      await refresh($).catch(() => {})
      await maybeResume($).catch(() => {})
    })
    refresh($).catch(err => update($, status, () => `Error: ${String(err).slice(0, 120)}`))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const r = await syncStop($)
    if (!r) return next(e)
    await update($, stoppedBy, () => r.kind)
    return {
      deny: `${r.text} No uses más herramientas ni empieces nada nuevo. Responde ahora en 2 o 3 líneas: dónde quedaste y cuál es el siguiente paso.`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'plugin') return next(e)
    const r = await syncStop($)
    return r ? { drop: r.text } : next(e)
  })

  on('command.run', { command: 'uso-continuar' }, async ($, e) => {
    const l = await limit($)
    if (!l) return { text: 'Aún no hay dato del bloque de 5 h.' }
    const isAll = e.args.trim().toLowerCase() === 'todas'
    const list = await targets($, e.args)
    if (!list.length) return { text: 'No encontré esa sesión. Usa el n° del desglose, "todas" o nada para esta sesión.' }
    if (isAll) await $.store.set(APPROVED_KEY, l.resetsAt)
    for (const t of list) {
      await $.store.set(brakeOkKey(t.id), l.resetsAt)
      await $.store.set(capOkKey(t.id), l.resetsAt)
    }
    await maybeResume($)
    await syncStop($)
    const who = isAll ? 'todas las sesiones' : list.map(t => t.title).join(', ')
    return { text: `Freno y tope liberados para ${who} hasta el reinicio de las ${hhmm(l.resetsAt)}.` }
  })

  on('command.run', { command: 'uso-limite' }, async ($, e) => {
    const me = await $.session.id()
    const a = e.args.trim().toLowerCase().replace('%', '').replace(',', '.')
    if (!a) {
      const cap = await capOf($, me)
      return { text: (cap !== undefined ? `Tope de esta sesión: ${fmt(cap)} % del bloque de 5 h. Cámbialo con /uso-limite <n> o quítalo con /uso-limite quitar.` : 'Esta sesión no tiene tope. Ponle uno con /uso-limite <n>, por ejemplo /uso-limite 20.') }
    }
    if (a === 'quitar') {
      await $.store.set(capKey(me), 0)
      await refresh($).catch(() => {})
      return { text: 'Tope de esta sesión quitado.' }
    }
    const n = Number(a)
    if (!(n > 0 && n <= 100)) return { text: 'Uso: /uso-limite 40 (porcentaje del bloque de 5 h) o /uso-limite quitar.' }
    await $.store.set(capKey(me), n)
    await $.store.delete(capOkKey(me))
    await refresh($).catch(() => {})
    return { text: `Tope de esta sesión: ${fmt(n)} % del bloque de 5 h.` }
  })

  on('command.run', { command: 'uso-pausar' }, async ($, e) => {
    const list = await targets($, e.args)
    if (!list.length) return { text: 'No encontré esa sesión. Usa el n° del desglose, "todas" o nada para esta sesión.' }
    for (const t of list) await $.store.set(pauseKey(t.id), true)
    await refresh($).catch(() => {})
    await syncStop($)
    return { text: `Pausada(s): ${list.map(t => t.title).join(', ')}. Se detienen en su próximo paso.` }
  })

  on('command.run', { command: 'uso-reanudar' }, async ($, e) => {
    const list = await targets($, e.args)
    if (!list.length) return { text: 'No encontré esa sesión. Usa el n° del desglose, "todas" o nada para esta sesión.' }
    for (const t of list) await $.store.delete(pauseKey(t.id))
    await refresh($).catch(() => {})
    await maybeResume($)
    await syncStop($)
    return { text: `Reanudada(s): ${list.map(t => t.title).join(', ')}. Las que estaban trabajando retoman en menos de un minuto.` }
  })

  on('command.run', { command: 'uso-prueba-freno' }, async $ => {
    if (await read($, test)) {
      await update($, test, () => null)
      await update($, stoppedBy, () => '')
      await syncStop($)
      return { text: 'Prueba del freno terminada.' }
    }
    const resetsAt = new Date(Date.now() + 60000).toISOString()
    await update($, test, () => ({ pct: 84, resetsAt }))
    await syncStop($)
    return { text: 'Prueba del freno activa solo en esta sesión: simula 84 % con reinicio en 1 min (reanuda en ~3 min). Pídele a Claude que haga algo para ver el freno.' }
  })

  on('command.run', { command: 'uso-sin-freno' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'todas') return { text: 'El ∞ se activa de a una sesión.' }
    const t = (await targets($, e.args))[0]
    if (!t) return { text: 'No encontré esa sesión. Usa el n° del desglose o nada para esta sesión.' }
    await update($, armed, () => t.id)
    await toggleBypass($, t.id)
    return { text: 'Listo. Revisa el aviso para ver el resultado.' }
  })

  on('command.run', { command: 'uso-config' }, async $ => {
    await update($, cfgTab, () => 'ajustes')
    await $.ui.open({ id: HISTORY_PANE, title: 'Uso por sesión' })
    return { text: 'Configuración abierta.' }
  })

  on('command.run', { command: 'uso-historial' }, async $ => {
    await update($, cfgTab, () => 'historial')
    await $.ui.open({ id: HISTORY_PANE, title: 'Uso por sesión' })
    return { text: 'Historial de uso abierto.' }
  })

  on('ui.render', { component: 'Pane', requestId: HISTORY_PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const tab = await read($, cfgTab)
    const tabs = (
      <Box flexDirection="row" gap="sm">
        {[['ajustes', '⚙ Ajustes'], ['historial', 'Historial'], ['ayuda', 'Comandos']].map(([id, label]) => (
          <Button key={`tab-${id}`} label={label!} variant={tab === id ? 'primary' : 'secondary'} onPress={() => void update($, cfgTab, () => id!)} />
        ))}
      </Box>
    )
    if (tab === 'ajustes') {
      const cfg = await loadCfg($)
      const set = async (k: keyof Cfg, v: number) => {
        await $.store.set(CFG_KEY, { ...(await loadCfg($)), [k]: v })
        await loadCfg($)
        await refresh($).catch(() => {})
        await syncStop($)
        await update($, cfgTab, () => 'ajustes')
      }
      const rows: { k: keyof Cfg; label: string; hint: string; step: number; min: number; max: number; show: (v: number) => string }[] = [
        { k: 'brakeAt', label: 'Freno global', hint: 'Al llegar a este % del bloque de 5 h se frenan todas las sesiones. Lo que queda sobre el freno es el margen para cerrar ordenado.', step: 1, min: 50, max: 99, show: v => `${v} %` },
        { k: 'closeMargin', label: 'Margen de cierre', hint: 'Cuánto antes del tope de una sesión (o del 100 % en una sesión ∞) empieza el cierre ordenado.', step: 1, min: 0, max: 10, show: v => `${v} %` },
        { k: 'marginMin', label: 'Reanudar tras el reinicio', hint: 'Minutos de espera después del reinicio antes de retomar las sesiones frenadas.', step: 1, min: 0, max: 30, show: v => `${v} min` },
        { k: 'defaultCap', label: 'Tope por defecto', hint: 'Tope con que parte toda sesión que no tenga uno propio. 0 = sin tope.', step: 5, min: 0, max: 100, show: v => (v ? `${v} %` : 'sin tope') },
        { k: 'maxBypass', label: 'Sesiones sin freno (∞)', hint: 'Cuántas sesiones pueden ignorar el freno global a la vez. 0 = función desactivada.', step: 1, min: 0, max: 3, show: v => (v ? String(v) : 'desactivado') },
        { k: 'warnPct', label: 'Aviso del tope', hint: 'Avisa cuando una sesión llega a este % de su tope.', step: 5, min: 50, max: 100, show: v => `${v} % del tope` },
      ]
      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          {rows.map(r => (
            <Box key={r.k} flexDirection="column">
              <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                <Text weight="medium">{r.label}</Text>
                <Box flexGrow={1} />
                <Button key={`${r.k}-dn`} label="−" onPress={() => void set(r.k, Math.max(r.min, cfg[r.k] - r.step))} />
                <Text tabular>{r.show(cfg[r.k])}</Text>
                <Button key={`${r.k}-up`} label="+" onPress={() => void set(r.k, Math.min(r.max, cfg[r.k] + r.step))} />
              </Box>
              <Text size="caption" dimColor>{r.hint}{cfg[r.k] === DEFAULTS[r.k] ? '' : ` Por defecto: ${r.show(DEFAULTS[r.k])}.`}</Text>
            </Box>
          ))}
          <Box flexDirection="row" gap="sm">
            <Button key="cfg-reset" label="Restaurar valores por defecto" onPress={() => void $.store.set(CFG_KEY, { ...DEFAULTS }).then(() => set('brakeAt', DEFAULTS.brakeAt))} />
          </Box>
          <Text size="caption" dimColor>Los ajustes valen para todas tus sesiones y llegan a las demás en menos de un minuto.</Text>
        </Box>
      )
    }
    if (tab === 'ayuda') {
      const help: [string, string][] = [
        ['/uso', 'Oculta o muestra la franja (también la ✕).'],
        ['/uso-config', 'Abre este panel.'],
        ['/uso-historial', 'Abre el panel en el historial.'],
        ['/uso-limite 30', 'Tope de esta sesión en % del bloque de 5 h.'],
        ['/uso-limite', 'Muestra el tope actual de esta sesión.'],
        ['/uso-limite quitar', 'Quita el tope de esta sesión.'],
        ['/uso-pausar [n° | todas]', 'Pausa esta sesión, la n° del desglose o todas.'],
        ['/uso-reanudar [n° | todas]', 'Reanuda; las que trabajaban retoman solas.'],
        ['/uso-continuar [n° | todas]', 'Libera freno y tope hasta el reinicio (sin nada: esta sesión).'],
        ['/uso-sin-freno [n°]', 'Activa o quita el ∞: la sesión ignora el freno global hasta el reinicio (pide confirmar).'],
        ['/uso-prueba-freno', 'Simula el freno en esta sesión; repítelo para terminar.'],
      ]
      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          <Text size="caption" dimColor>En los comandos con número o texto, presiona Esc antes de Enter para cerrar el menú de sugerencias.</Text>
          {help.map(([cmd, what]) => (
            <Box key={cmd} flexDirection="column">
              <Text weight="medium" mono>{cmd}</Text>
              <Text size="caption" dimColor>{what}</Text>
            </Box>
          ))}
          <Text size="caption" weight="medium">Colores del punto</Text>
          <Text size="caption" dimColor>Verde holgado · amarillo justo · naranjo te pasas por menos de 1 h · rojo 1–2 h · morado 2–3 h · morado oscuro más. Desde rojo parpadea.</Text>
          <Text size="caption" weight="medium">Desglose</Text>
          <Text size="caption" dimColor>− / + cambian el tope de la sesión de a 10 %; ⏸ / ▶ la pausan o reanudan; ∞ la deja sin freno global (nombre en color de Claude); la raya clara en la barra marca su tope.</Text>
        </Box>
      )
    }
    const Svg = 'Svg' in els ? els.Svg : undefined
    const Select = 'Select' in els ? els.Select : undefined
    const raw = await $.store.get(HISTORY_KEY)
    const all = Array.isArray(raw) ? (raw as HistoryBlock[]) : []
    const range = await read($, histRange)
    const perSession = range === 'semana' || range === 'mes'
    const who = perSession ? await read($, histSession) : ''
    const { buckets, unit } = bucketize(all, range, who)
    const titles = [...new Set(all.filter(b => Date.now() - Date.parse(b.resetsAt) < 31 * 86400e3).flatMap(b => b.top.map(t => t.title)))]
    const width = Math.max(260, Math.min(900, (e.props.bodyColumns ?? 60) * 8))
    const ranges = [
      { value: 'semana', label: 'Última semana' },
      { value: 'mes', label: 'Último mes' },
      { value: 'año', label: 'Último año' },
      { value: 'todo', label: 'Histórico' },
    ]
    return (
      <Box flexDirection="column" gap="sm">
        {tabs}
        <Box flexDirection="row" gap="sm" alignItems="center">
          {Select && <Select key="range" label="Periodo" options={ranges} value={range} onSelect={v => void update($, histRange, () => v)} />}
          {Select && perSession && (
            <Select key="who" label="Sesión" options={[{ value: '', label: 'Todas' }, ...titles.map(t => ({ value: t, label: t.length > 30 ? `${t.slice(0, 29)}…` : t }))]}
              value={who} onSelect={v => void update($, histSession, () => v)} />
          )}
        </Box>
        {!perSession && <Text size="caption" dimColor>El detalle por sesión está disponible hasta el último mes.</Text>}
        {buckets.length === 0 || !Svg ? (
          <Text dimColor>Aún no hay bloques guardados en este periodo. El historial se llena desde que el mod quedó instalado.</Text>
        ) : (
          <Box flexDirection="column" gap="sm">
            <Text size="caption" weight="medium">{unit}</Text>
            <Svg source={historyChart(buckets, width, range === 'semana')} alt="Uso en el periodo" width={width} height={210} isInteractive />
            {range === 'semana' && (
              <Box flexDirection="column" gap="sm">
                <Text size="caption" weight="medium">Semanal · % acumulado</Text>
                <Svg source={weeklyChart(all.filter(b => Date.now() - Date.parse(b.resetsAt) < 7 * 86400e3).reverse(), width)} alt="Uso semanal en el tiempo" width={width} height={120} isInteractive />
              </Box>
            )}
            <Text size="caption" dimColor>Pasa el cursor sobre una barra para ver el detalle.{range === 'semana' ? ' Línea roja: freno del 83 %.' : ''}</Text>
          </Box>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'uso' }, async $ => {
    const hidden = !(await read($, isMin))
    await update($, isMin, () => hidden)
    return { text: hidden ? 'Franja de uso oculta. Escribe /uso para volver a mostrarla.' : 'Franja de uso visible.' }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    refresh($).catch(err => update($, status, () => `Error: ${String(err).slice(0, 120)}`))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey) return next(e)
    if (snap === null) {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{await read($, status)}</Text>
    }

    const open = await read($, isOpen)
    const me = await $.session.id()
    const { Box, Button, Text } = $.ui.resolve(e)
    const toggle = () => update($, isOpen, v => !v)
    const total = snap.fiveHour || 1
    const scale = Math.max(total, ...snap.sessions.map(s => s.cap ?? 0))
    const now = await read($, nowMs)
    const braked = await read($, isBraked)
    const resume = await read($, resumeAt)
    const minimize = () => update($, isMin, v => !v)

    if (await read($, isMin)) {
      return next(e)
    }

    const cols = e.props.bodyColumns ?? 120
    const myBypass = !!snap.sessions.find(s => s.id === me)?.bypass
    const armedId = await read($, armed)
    const bypassFull = snap.sessions.filter(s => s.bypass).length >= CFG.maxBypass
    const mode = cols >= 95 ? 'wide' : cols >= 65 ? 'mid' : 'narrow'
    const W = { wide: { head: 24, row: 16, name: 36, title: 34 }, mid: { head: 14, row: 10, name: 24, title: 22 }, narrow: { head: 8, row: 10, name: 0, title: 30 } }[mode]
    const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
    const cells = (pct: number, width: number) => Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
    const els = $.ui.resolve(e)
    const Svg = 'Svg' in els ? els.Svg : undefined
    const track = (width: number, mine: number, rest: number, isMine = true, cap?: number) => {
      const px = width * 7
      if (Svg) {
        return <Svg source={svgBar(px, mine, rest, isMine ? '#3b82f6' : '#7d7b74', cap)} alt={`${fmt(mine)} %`} width={px} height={6} />
      }
      const a = cells(mine, width)
      const b = Math.min(width - a, cells(rest, width))
      return (
        <Text size="caption">
          <Text color={isMine ? 'suggestion' : 'text'} dimColor={!isMine}>{'▆'.repeat(a)}</Text>
          <Text color="text" dimColor>{'▆'.repeat(b)}</Text>
          <Text color="promptBorder">{'▆'.repeat(width - a - b)}</Text>
        </Text>
      )
    }

    return (
      <Box flexDirection="column" paddingX="sm">
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Text size="caption" wrap="truncate">
            {myBypass && <Text color={CLAY} weight="semibold">∞ </Text>}
            {mode !== 'narrow' && <Text weight="medium" color={myBypass ? CLAY : undefined}>Esta sesión </Text>}
            <Text weight="semibold" tabular>{fmt(snap.current)} %</Text>
            <Text dimColor>{mode === 'wide' ? ` de ${fmt(snap.fiveHour)} % usado` : ` / ${fmt(snap.fiveHour)} %`}</Text>
          </Text>
          {track(W.head, snap.current, snap.fiveHour - snap.current, true, snap.sessions.find(s => s.id === me)?.cap)}
          <Box flexGrow={1} />
          {(() => {
            const c = paceColor(snap.fiveHour, snap.resetsAt, now)
            const dot = !c ? null : Svg ? (
              <Svg source={dotSvg(c)} alt="ritmo de uso" width={10} height={10} isInteractive={BLINKS.includes(c)} />
            ) : (
              <Text size="caption" color={c}>●</Text>
            )
            if (braked) {
              return (
                <Text size="caption" color="#ef4444" wrap="truncate">{resume ? (mode === 'wide' ? `⏸ frenado · reanuda ${hhmm(new Date(resume).toISOString())}` : `⏸ ${hhmm(new Date(resume).toISOString())}`) : '⏸ pausada'}</Text>
              )
            }
            return (
              <Box flexDirection="row" alignItems="center" gap="xs">
                {dot}
                <Text size="caption" dimColor wrap="truncate">{mode === 'wide' ? `se reinicia en ${left(snap.resetsAt, now)}` : leftShort(snap.resetsAt, now)}</Text>
              </Box>
            )
          })()}
          <Button key="min" label="✕" onPress={minimize} />
          <Button key="toggle" label={open ? '⌄' : '›'} onPress={toggle} />
        </Box>
        {open && (
          <Box flexDirection="column" gap="xs" paddingTop="xs">
            {snap.sessions.map((s, i) => {
              const name = (
                <Text size="caption" weight={s.id === me || s.bypass ? 'medium' : 'regular'} dimColor={s.id !== me && !s.bypass} color={s.bypass ? CLAY : undefined} wrap="truncate">
                  {i + 1}. {s.paused ? '⏸ ' : ''}{s.bypass ? '∞ ' : ''}{cut(s.title, W.title)}
                </Text>
              )
              const bar = track(W.row, (s.pct / scale) * 100, 0, s.id === me && !s.paused, s.cap === undefined ? undefined : (s.cap / scale) * 100)
              const pct = (
                <Text size="caption" tabular dimColor={s.id !== me} color={s.cap !== undefined && s.pct >= s.cap ? '#ef4444' : undefined}>
                  {fmt(s.pct)} %{s.bypass ? ' / ∞' : s.cap !== undefined ? ` / ${fmt(s.cap)} %` : ''}
                </Text>
              )
              const buttons = [
                <Button key={`dn-${s.id}`} label="−" onPress={() => void (s.bypass ? toggleBypass($, s.id) : stepCap($, s.id, -1))} />,
                (s.cap === undefined || s.cap >= 100) && CFG.maxBypass > 0 && !s.bypass && bypassFull
                  ? <Box key={`up-${s.id}`}><Text dimColor>  ∞  </Text></Box>
                  : (s.cap === undefined || s.cap >= 100) && CFG.maxBypass > 0
                  ? <Button key={`up-${s.id}`} label={s.bypass ? '∞ activo' : armedId === s.id ? '¿Seguro? ∞' : '∞'} dimColor={!s.bypass && bypassFull} variant={s.bypass ? 'primary' : undefined} onPress={() => void (s.bypass ? undefined : toggleBypass($, s.id))} />
                  : <Button key={`up-${s.id}`} label="+" onPress={() => void stepCap($, s.id, 1)} />,
                <Button key={`p-${s.id}`} label={s.paused ? '▶' : '⏸'} onPress={() => void setPaused($, s.id, !s.paused)} />,
              ]
              if (mode === 'narrow') {
                return (
                  <Box key={s.id} flexDirection="column">
                    <Box flexDirection="row" gap="sm">{name}<Box flexGrow={1} />{pct}</Box>
                    <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>{bar}<Box flexGrow={1} />{buttons}</Box>
                  </Box>
                )
              }
              return (
                <Box key={s.id} flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                  <Box width={W.name}>{name}</Box>
                  {bar}
                  {pct}
                  <Box flexGrow={1} />
                  {buttons}
                </Box>
              )
            })}
            {snap.weekly !== null && (() => {
              const c = paceColor(snap.weekly, snap.weeklyResetsAt, now, SEVEN_DAYS)
              const dot = !c ? null : Svg ? (
                <Svg source={dotSvg(c)} alt="ritmo semanal" width={10} height={10} isInteractive={BLINKS.includes(c)} />
              ) : (
                <Text size="caption" color={c}>●</Text>
              )
              const ms = snap.weeklyResetsAt && now ? Date.parse(snap.weeklyResetsAt) - now : 0
              const rest = ms > 0 ? (ms >= 86400e3 ? `${Math.floor(ms / 86400e3)} d ${Math.floor((ms % 86400e3) / 3600e3)} h` : `${Math.floor(ms / 3600e3)} h`) : ''
              return (
                <Box flexDirection="row" alignItems="center" gap="xs">
                  <Text size="caption" dimColor>{mode === 'wide' ? 'Semanal · todos los modelos' : 'Semanal'} {fmt(snap.weekly)} %</Text>
                  {dot}
                  {rest && <Text size="caption" dimColor>{mode === 'wide' ? `se reinicia en ${rest}` : rest}</Text>}
                </Box>
              )
            })()}
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap="sm" minHeight={2}>
              <Box flexGrow={1} />
              <Button key="pause-all" label="⏸ Todas" onPress={() => void Promise.all(snap.sessions.map(s => $.store.set(pauseKey(s.id), true))).then(() => setPaused($, me, true))} />
              <Button key="resume-all" label="▶ Todas" onPress={() => void Promise.all(snap.sessions.map(s => $.store.delete(pauseKey(s.id)))).then(() => setPaused($, me, false))} />
              <Button key="config" label="⚙ Configuración" onPress={() => void update($, cfgTab, () => 'ajustes').then(() => $.ui.open({ id: HISTORY_PANE, title: 'Uso por sesión' }))} />
              {braked && <Button key="continue" label="Continuar" variant="primary" onPress={() => void $.command.run({ command: 'uso-continuar', args: '' })} />}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
