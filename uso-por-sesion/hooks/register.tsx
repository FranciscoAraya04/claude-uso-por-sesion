import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { BrakeTest, HistoryBlock, Scheduled, SchedDraft, SchedUi, SessionShare, Snapshot } from '../types'

const snapshot = atom({ plugin: 'uso-por-sesion', key: 'snapshot' } as const, null)
const isOpen = atom({ plugin: 'uso-por-sesion', key: 'isOpen' } as const, false)
const isMin = atom({ plugin: 'uso-por-sesion', key: 'isMin' } as const, false)
const nowMs = atom({ plugin: 'uso-por-sesion', key: 'nowMs' } as const, 0)
const status = atom({ plugin: 'uso-por-sesion', key: 'status' } as const, '')

const test = atom({ plugin: 'uso-por-sesion', key: 'test' } as const, null as BrakeTest | null)
const resumeAt = atom({ plugin: 'uso-por-sesion', key: 'resumeAt' } as const, 0)
const isBraked = atom({ plugin: 'uso-por-sesion', key: 'isBraked' } as const, false)
// Por qué se detuvo esta sesión mientras trabajaba ('' = no detenida); al liberarse, se reanuda sola.
// Bloque (resetsAt) en que ya se avisó que esta sesión se acerca a su tope.
const warnedFor = atom({ plugin: 'uso-por-sesion', key: 'warnedFor' } as const, '')
// Reinicio semanal en que ya se avisó que esta sesión se acerca a su tope semanal.
const warnedWeek = atom({ plugin: 'uso-por-sesion', key: 'warnedWeek' } as const, '')
// Vista de topes en la pestaña Sesiones: 'bloque' (5 h) o 'semana'.
const capView = atom({ plugin: 'uso-por-sesion', key: 'capView' } as const, 'bloque')
// Sesión elegida en el selector del desglose ('' = esta sesión).
const selected = atom({ plugin: 'uso-por-sesion', key: 'selected' } as const, '')
const histRange = atom({ plugin: 'uso-por-sesion', key: 'histRange' } as const, 'semana')
const histSession = atom({ plugin: 'uso-por-sesion', key: 'histSession' } as const, '')
// Agrupación en semana y mes: 'bloque' (ventana de 5 h), 'dia' o '' (automático según el periodo).
const histGroup = atom({ plugin: 'uso-por-sesion', key: 'histGroup' } as const, '')
// Semana del gráfico semanal: 0 = la actual, 1 = la anterior, etc.
const histWeek = atom({ plugin: 'uso-por-sesion', key: 'histWeek' } as const, 0)
// Costo de semanas pasadas (USD a precios de API), por fecha de reinicio; también se guarda en el almacén.
const weekCosts = atom({ plugin: 'uso-por-sesion', key: 'weekCosts2' } as const, {} as Record<string, number>)
const WEEK_COSTS_KEY = 'costo-semanas-v2'
// Semanas cuyo costo se está calculando, para no lanzar el cálculo dos veces.
const COSTING = new Set<string>()
const cfgTab = atom({ plugin: 'uso-por-sesion', key: 'cfgTab' } as const, 'sesiones')
// Sesión cuyo botón ∞ espera el segundo toque de confirmación ('' = ninguna).
const armed = atom({ plugin: 'uso-por-sesion', key: 'armed' } as const, '')
const stoppedBy = atom({ plugin: 'uso-por-sesion', key: 'stoppedBy' } as const, '')

// Prompts programados: cuadro abierto en el panel, su borrador y error, el último enviado que aún espera
// respuesta (sus seguimientos salen al terminar el turno) y un contador para redibujar tras cada cambio.
const schedUi = atom({ plugin: 'uso-por-sesion', key: 'schedUi' } as const, null as SchedUi | null)
const schedDraft = atom({ plugin: 'uso-por-sesion', key: 'schedDraft' } as const, { text: '', type: 'next', time: '07:30' } as SchedDraft)
const schedErr = atom({ plugin: 'uso-por-sesion', key: 'schedErr' } as const, '')
const schedActive = atom({ plugin: 'uso-por-sesion', key: 'schedActive' } as const, '')
const schedRev = atom({ plugin: 'uso-por-sesion', key: 'schedRev' } as const, 0)
// Desde cuándo esta sesión está trabajando en un turno (0 = libre): nada programado sale en medio de uno.
const busyAt = atom({ plugin: 'uso-por-sesion', key: 'busyAt' } as const, 0)
const BUSY_MAX = 6 * 3600e3
const SCHED_KEY = 'programados'
// Lo que se va escribiendo en el cuadro: se guarda sin redibujar el panel (redibujar con cada tecla hacía
// parpadear el cuadro y, al escribir rápido, el texto viejo pisaba al nuevo). Se aplica al guardar o al cambiar de opción.
let schedTyped: { text?: string; time?: string } = {}
// Color de lo programado: el mismo lavanda de la luna y de las sesiones ∞.
const SCHED_COLOR = '#a5b4fc'

const FIVE_HOURS = 5 * 3600e3
// Color de las sesiones ∞: el mismo azul lavanda de la luna del horario de sueño (se lee como "modo superior", no como error).
const CLAY = '#a5b4fc'
// Freno: al 83 % del bloque se detiene todo; el 2 % restante alcanza para cerrar ordenado.
// Ajustes de cada persona, guardados en el almacén compartido; estos son los valores por defecto.
type Lang = 'en' | 'es'
// Idioma por defecto: español si el sistema está en español; si no, inglés.
const sysLang = (): Lang => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('es') ? 'es' : 'en'
  } catch {
    return 'en'
  }
}
const NUM_DEFAULTS = { brakeAt: 83, closeMargin: 2, marginMin: 2, defaultCap: 35, warnPct: 80, maxBypass: 1, capStep: 10, sleepOn: 1, sleepStart: 23, sleepEnd: 7 }
type NumKey = keyof typeof NUM_DEFAULTS
const DEFAULTS: typeof NUM_DEFAULTS & { lang: Lang } = { ...NUM_DEFAULTS, lang: sysLang() }
type Cfg = typeof DEFAULTS
const CFG_KEY = 'config'
let CFG: Cfg = { ...DEFAULTS }
const resumeMargin = () => CFG.marginMin * 60000
// Texto visible según el idioma elegido.
const L = (es: string, en: string) => (CFG.lang === 'en' ? en : es)
// Nombres en inglés de los comandos (mismo comportamiento que los /uso-…).
const EN_CMD = {
  'uso': 'session-usage',
  'uso-limite': 'session-limit',
  'uso-pausar': 'session-pause',
  'uso-reanudar': 'session-resume',
  'uso-continuar': 'session-continue',
  'uso-sin-freno': 'session-no-brake',
  'uso-config': 'session-config',
  'uso-historial': 'session-history',
  'uso-prueba-freno': 'session-brake-test',
  'uso-programar': 'session-schedule',
  'uso-programados': 'session-scheduled',
  'uso-cancelar': 'session-unschedule',
  'uso-seguimiento': 'session-follow-up',
} as const
type CmdName = keyof typeof EN_CMD
// Comando tal como se le muestra a la persona, en su idioma.
const C = (name: CmdName) => `/${CFG.lang === 'en' ? EN_CMD[name] : name}`
const ALL_WORDS = ['todas', 'todos', 'all']
const isAllArg = (a: string) => ALL_WORDS.includes(a.trim().toLowerCase())

async function loadCfg($: { store: { get: (k: string) => Promise<unknown> } }) {
  const raw = await $.store.get(CFG_KEY)
  const saved = raw && typeof raw === 'object' ? (raw as Partial<Cfg>) : {}
  CFG = { ...DEFAULTS, ...saved }
  if (CFG.lang !== 'en' && CFG.lang !== 'es') CFG.lang = DEFAULTS.lang
  return CFG
}
const APPROVED_KEY = 'freno-aprobado'
const DISCLAIMER_KEY = 'aviso-visto'
const RESUME_TEXT = (): Record<string, string> => ({
  freno: L('El bloque de 5 horas se restableció (freno de uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
    'The 5-hour block has reset (uso-por-sesion brake). Continue the task exactly where you left off.'),
  tope: L('El bloque de 5 horas se restableció o se liberó el tope de esta sesión (uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
    "The 5-hour block has reset or this session's cap was released (uso-por-sesion). Continue the task exactly where you left off."),
  limite: L('El bloque de 5 horas se restableció (uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
    'The 5-hour block has reset (uso-por-sesion). Continue the task exactly where you left off.'),
  semanal: L('Se reinició el límite semanal o se liberó el tope semanal de esta sesión (uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
    "The weekly limit has reset or this session's weekly cap was released (uso-por-sesion). Continue the task exactly where you left off."),
  pausa: L('Esta sesión fue reanudada (uso-por-sesion). Continúa la tarea exactamente donde la dejaste.',
    'This session was resumed (uso-por-sesion). Continue the task exactly where you left off.'),
})
const capKey = (id: string) => `tope:${id}`
// Tope por defecto de toda sesión; 0 guardado = sin tope.
const HISTORY_KEY = 'historial'
const HISTORY_PANE = 'uso-config'
const paneTitle = () => L('Uso por sesión', 'Usage per session')
const SEVEN_DAYS = 7 * 24 * 3600e3

async function capOf($: { store: { get: (k: string) => Promise<unknown> } }, id: string) {
  const v = await $.store.get(capKey(id))
  if (v === 0) return undefined
  if (typeof v === 'number') return v
  return CFG.defaultCap > 0 ? CFG.defaultCap : undefined
}
const capOkKey = (id: string) => `tope-ok:${id}`
// Tope semanal: % del límite semanal (100 = sin tope, el valor por defecto) y su liberación hasta el reinicio semanal.
const wcapKey = (id: string) => `tope-sem:${id}`
const wcapOkKey = (id: string) => `tope-sem-ok:${id}`
async function wcapOf($: { store: { get: (k: string) => Promise<unknown> } }, id: string) {
  const v = await $.store.get(wcapKey(id))
  return typeof v === 'number' && v > 0 && v < 100 ? v : 100
}
// Mismo reinicio semanal (la hora informada varía unos segundos).
const sameWeek = (a: unknown, b: string | null | undefined) =>
  typeof a === 'string' && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 6 * 3600e3
// Día y hora, para reinicios que pueden caer otro día.
const dayHour = (iso: string) => `${dayName(iso)} ${hhmm(iso)}`
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
  const ht = 6
  const r = ht / 2
  const a = Math.max(0, Math.min(width, (mine / 100) * width))
  const b = Math.max(0, Math.min(width - a, (rest / 100) * width))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ht}" viewBox="0 0 ${width} ${ht}">` +
    '<style>.bg{fill:#3a3936}.rest{fill:#7d7b74}.cap{fill:#f5f5f4}' +
    '@media (prefers-color-scheme: light){.bg{fill:#e4e2db}.rest{fill:#a19f97}.cap{fill:#2b2a27}}</style>' +
    `<clipPath id="c"><rect width="${width}" height="${ht}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#c)"><rect class="bg" width="${width}" height="${ht}"/>` +
    `<rect class="rest" width="${(a + b).toFixed(1)}" height="${ht}"/>` +
    `<rect width="${a.toFixed(1)}" height="${ht}" fill="${mineColor}"/></g>` +
    (cap === undefined ? '' : `<rect x="${Math.max(0, Math.min(width - 2, (cap / 100) * width - 1)).toFixed(1)}" width="2" height="${ht}" class="cap"/>`) +
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
  let hash = 0
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]!
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const shortDay = (iso: string) => {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0')
  return CFG.lang === 'en' ? `${mm}/${dd}` : `${dd}/${mm}`
}

const DOW_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayName = (iso: string) => {
  const d = new Date(iso)
  return `${(CFG.lang === 'en' ? DOW_EN : DOW_ES)[d.getDay()]} ${d.getDate()}`
}
const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// day: día al que pertenece la barra; donde cambia, el gráfico traza un separador con su nombre.
type Bucket = { label: string; tip: string; total: number; parts: { title: string; pct: number }[]; day?: string }

// Agrupa el historial según el periodo: bloques (semana), días (mes), semanas (año) o meses (histórico).
// Fuera de "semana" el valor es la suma de % de bloque: 150 % = un bloque y medio gastado.
function bucketize(all: HistoryBlock[], range: string, who: string, group = ''): { buckets: Bucket[]; unit: string } {
  const now = Date.now()
  const days = range === 'semana' ? 7 : range === 'mes' ? 31 : range === 'año' ? 366 : Infinity
  const list = all.filter(b => now - Date.parse(b.resetsAt) < days * 86400e3).slice().reverse()
  const pick = (b: HistoryBlock) => (who ? b.top.filter(t => t.title === who) : b.top)
  const value = (b: HistoryBlock) => (who ? pick(b).reduce((a, t) => a + t.pct, 0) : b.pct)
  const byBlock = range === 'semana' ? group !== 'dia' : range === 'mes' && group === 'bloque'
  if (byBlock) {
    return {
      unit: who ? L(`Ventanas de 5 h · % del límite usado por ${who}`, `5-hour windows · % of limit used by ${who}`) : L('Ventanas de 5 h · % del límite', '5-hour windows · % of limit'),
      buckets: list.map(b => ({
        label: hhmm(b.resetsAt),
        day: dayName(b.resetsAt),
        tip: `${shortDay(b.resetsAt)} ${hhmm(new Date(Date.parse(b.resetsAt) - FIVE_HOURS).toISOString())}–${hhmm(b.resetsAt)} · ${fmt(value(b))} %`,
        total: value(b),
        parts: pick(b),
      })),
    }
  }
  const keyOf = (iso: string) => {
    const d = new Date(iso)
    if (range === 'mes' || range === 'semana') return dayKey(iso)
    if (range === 'año') {
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
    }
    return `${d.getFullYear()}-${d.getMonth()}`
  }
  const MONTHS = CFG.lang === 'en'
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const groups = new Map<string, Bucket>()
  for (const b of list) {
    const k = keyOf(b.resetsAt)
    const d = new Date(b.resetsAt)
    const label = range === 'todo' ? `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : range === 'año' ? `${L('sem', 'wk')} ${shortDay(b.resetsAt)}` : dayName(b.resetsAt)
    const g = groups.get(k) ?? { label, tip: '', total: 0, parts: [] }
    g.total += value(b)
    if (range === 'mes' || range === 'semana') {
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
    tip: L(`${g.label} · ${fmt(g.total)} % de bloque (≈ ${fmt(g.total / 100)} bloques)`, `${g.label} · ${fmt(g.total)} % of block (≈ ${fmt(g.total / 100)} blocks)`),
  }))
  const per = range === 'mes' || range === 'semana' ? L('día', 'day') : range === 'año' ? L('semana', 'week') : L('mes', 'month')
  return { unit: L(`Uso por ${per} · suma de % de bloque${who ? ` de ${who}` : ''}`, `Usage per ${per} · sum of block %${who ? ` for ${who}` : ''}`), buckets }
}

// Barras apiladas: cada sesión con su color, el resto en gris; con freno, línea al 83 %.
function historyChart(list: Bucket[], width: number, showBrake: boolean) {
  const ht = 222, top = 14, bottom = 46, left = 34, plot = ht - top - bottom
  const max = Math.max(100, ...list.map(b => b.total))
  const step = (width - left - 8) / list.length
  const bw = Math.max(4, Math.min(28, step * 0.7))
  const y = (pct: number) => top + plot - (Math.min(max, pct) / max) * plot
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ht}" viewBox="0 0 ${width} ${ht}" font-family="sans-serif" font-size="10">` + '<style>.g{stroke:#3a3936}.m{fill:#8f8d85}.l{fill:#c8c6bd}.dv{stroke:#55534e}@media (prefers-color-scheme: light){.g{stroke:#e4e2db}.m{fill:#6b6963}.l{fill:#3d3c38}.dv{stroke:#b4b2a9}}</style>'
  for (const g of [0, max / 2, max]) {
    out += `<line x1="${left}" x2="${width - 4}" y1="${y(g)}" y2="${y(g)}" class="g" stroke-width="1"/><text x="${left - 4}" y="${y(g) + 3}" class="m" text-anchor="end">${Math.round(g)}</text>`
  }
  const legend = new Map<string, string>()
  let lastDayX = -1e9
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
    const cx = (x + bw / 2).toFixed(1)
    // Con pocas barras, el valor va escrito encima (el desktop no muestra tooltips).
    if (list.length <= 16 && b.total > 0) {
      out += `<text x="${cx}" y="${(y(b.total) - 3).toFixed(1)}" class="l" text-anchor="middle" font-size="9">${fmt(b.total)}</text>`
    }
    if (b.day !== undefined) {
      // Barras por ventana de 5 h: separador y nombre del día donde empieza uno nuevo.
      if (b.day !== list[i - 1]?.day) {
        const room = left + i * step - lastDayX >= 44
        if (room) lastDayX = left + i * step
        const sx = (left + i * step).toFixed(1)
        if (i > 0) out += `<line x1="${sx}" x2="${sx}" y1="${top}" y2="${ht - bottom + 16}" class="dv" stroke-width="1" stroke-dasharray="2 3"/>`
        if (room) out += `<text x="${(+sx + 3).toFixed(1)}" y="${ht - bottom + 26}" class="l">${esc(b.day)}</text>`
      }
      if (list.length <= 24) out += `<text x="${cx}" y="${ht - bottom + 12}" class="m" text-anchor="middle" font-size="9">${esc(b.label)}</text>`
    } else if (i % Math.ceil(list.length / 8) === 0) {
      out += `<text x="${cx}" y="${ht - bottom + 14}" class="m" text-anchor="middle">${esc(b.label)}</text>`
    }
  })
  if (showBrake) out += `<line x1="${left}" x2="${width - 4}" y1="${y(CFG.brakeAt)}" y2="${y(CFG.brakeAt)}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 3"/>`
  let lx = left
  for (const [title, c] of [...legend].slice(0, 4)) {
    const label = title.length > 22 ? `${title.slice(0, 21)}…` : title
    out += `<rect x="${lx}" y="${ht - 10}" width="8" height="8" rx="2" fill="${c}"/><text x="${lx + 11}" y="${ht - 3}" class="l">${esc(label)}</text>`
    lx += 14 + label.length * 5.6
    if (lx > width - 60) break
  }
  return out + '</svg>'
}

// Uso semanal en su periodo real (del inicio al reinicio semanal), con días marcados y
// la proyección lineal al ritmo actual; hit = cuándo llegaría al 100 % antes del reinicio.
// En una semana pasada (past) no hay proyección ni raya de "ahora"; final = % con que terminó.
// Cuánto % de la semana consume un 1 % del bloque de 5 h, según tus ventanas de las últimas 3 semanas:
// lo que subió el semanal entre una ventana y la anterior, dividido por el % que se usó en ella.
// Sin datos suficientes (menos de una ventana completa en total) devuelve null.
function weekPerBlockPct(all: HistoryBlock[], now: number): number | null {
  const list = all.filter(b => b.weekly !== null && now - Date.parse(b.resetsAt) < 21 * 86400e3)
    .sort((a, b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt))
  let dw = 0, dp = 0
  for (let k = 1; k < list.length; k++) {
    const d = list[k]!.weekly! - list[k - 1]!.weekly!
    // Si bajó, entre medio se reinició la semana: ese par no sirve.
    if (d < 0 || list[k]!.pct <= 0) continue
    dw += d
    dp += list[k]!.pct
  }
  return dp >= 100 && dw > 0 ? dw / dp : null
}

function weeklyChart(list: HistoryBlock[], width: number, endIso: string, now: number, current: number | null, past = false): { svg: string; hit: number | null; final: number | null } {
  const ht = 130, top = 10, bottom = 22, left = 30, right = 8, plot = ht - top - bottom
  const end = Date.parse(endIso), start = end - SEVEN_DAYS
  const x = (t: number) => left + ((Math.min(end, Math.max(start, t)) - start) / SEVEN_DAYS) * (width - left - right)
  const y = (pct: number) => top + plot - (Math.min(100, pct) / 100) * plot
  const pts = list
    .filter(b => b.weekly !== null && Date.parse(b.resetsAt) > start && Date.parse(b.resetsAt) <= end)
    .map(b => ({ t: Math.min(now, Date.parse(b.resetsAt)), v: b.weekly! }))
  if (current !== null) pts.push({ t: now, v: current })
  pts.sort((a, b) => a.t - b.t)
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ht}" viewBox="0 0 ${width} ${ht}" font-family="sans-serif" font-size="10">` + '<style>.g{stroke:#3a3936}.m{fill:#8f8d85}.l{fill:#c8c6bd}.dv{stroke:#55534e}@media (prefers-color-scheme: light){.g{stroke:#e4e2db}.m{fill:#6b6963}.l{fill:#3d3c38}.dv{stroke:#b4b2a9}}</style>'
  for (const g of [0, 50, 100]) {
    out += `<line x1="${left}" x2="${width - right}" y1="${y(g)}" y2="${y(g)}" class="g" stroke-width="1"/><text x="${left - 4}" y="${y(g) + 3}" class="m" text-anchor="end">${g}</text>`
  }
  // Medianoches dentro del periodo: separador y nombre del día que empieza.
  const d = new Date(start)
  d.setHours(24, 0, 0, 0)
  // El día en que empieza la semana solo se rotula si cabe antes de la primera medianoche
  // (con reinicio a media tarde, ese tramo es angosto y los nombres se encimarían).
  if (x(d.getTime()) - left >= 44) out += `<text x="${left + 2}" y="${ht - 6}" class="l">${esc(dayName(new Date(start).toISOString()))}</text>`
  for (; d.getTime() < end; d.setDate(d.getDate() + 1)) {
    const sx = x(d.getTime()).toFixed(1)
    out += `<line x1="${sx}" x2="${sx}" y1="${top}" y2="${ht - bottom + 4}" class="dv" stroke-width="1" stroke-dasharray="2 3"/>`
    if (x(d.getTime()) < width - right - 24) out += `<text x="${(+sx + 3).toFixed(1)}" y="${ht - 6}" class="l">${esc(dayName(d.toISOString()))}</text>`
  }
  const nx = x(now).toFixed(1)
  if (!past) out += `<line x1="${nx}" x2="${nx}" y1="${top}" y2="${ht - bottom}" stroke="#8f8d85" stroke-width="1"/>`
  let hit: number | null = null
  const last = pts[pts.length - 1]
  if (!past && last && last.t > start && last.v > 0) {
    // Proyección: ritmo medio desde el inicio del periodo semanal.
    const rate = last.v / (last.t - start)
    const t100 = start + 100 / rate
    hit = t100 < end ? t100 : null
    const tEnd = Math.min(end, t100)
    out += `<line x1="${x(last.t).toFixed(1)}" y1="${y(last.v).toFixed(1)}" x2="${x(tEnd).toFixed(1)}" y2="${y(rate * (tEnd - start)).toFixed(1)}" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.8"/>`
    if (hit !== null) out += `<circle cx="${x(hit).toFixed(1)}" cy="${y(100).toFixed(1)}" r="4" fill="none" stroke="#ef4444" stroke-width="2"/>`
    else out += `<text x="${width - right - 2}" y="${(y(rate * (end - start)) - 5).toFixed(1)}" class="l" text-anchor="end" font-size="9">${fmt(rate * (end - start))} %</text>`
  }
  if (pts.length) {
    const path = [{ t: start, v: 0 }, ...pts].map((p, k) => `${k ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
    out += `<path d="${path} L${x(last!.t).toFixed(1)},${y(0)} Z" fill="#a855f7" opacity="0.15"/>`
    out += `<path d="${path}" fill="none" stroke="#a855f7" stroke-width="2"/>`
    for (const p of pts) out += `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.5" fill="#a855f7"/>`
    if (past) out += `<text x="${(x(last!.t) + 4).toFixed(1)}" y="${(y(last!.v) - 5).toFixed(1)}" class="l" font-size="9">${fmt(last!.v)} %</text>`
  }
  return { svg: out + '</svg>', hit, final: last?.v ?? null }
}

const leftShort = (iso: string | null, now: number) => left(iso, now).replace(' min', ' m')

// Mismo bloque de 5 h: la hora de reinicio que informa la API varía unos segundos entre respuestas.
const sameBlock = (a: unknown, b: string | null | undefined) =>
  typeof a === 'string' && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 30 * 60000

const fmt = (n: number) => {
  const t = n < 10 ? n.toFixed(1) : Math.round(n).toString()
  return CFG.lang === 'en' ? t : t.replace('.', ',')
}

// Límites del bloque: los de esta sesión si ya recibió una respuesta; si no, los últimos que vio
// cualquier sesión (así una sesión recién abierta muestra la franja y respeta el freno desde el inicio).
type Limits = { five?: { percentUsed: number; resetsAt?: string }; week?: { percentUsed: number; resetsAt?: string } }
const LAST_LIMITS_KEY = 'ultimo-limite'
// Sesiones abiertas: { id: { folder, seen } }; una sesión sin señales en 10 min se da por cerrada.
const ALIVE_KEY = 'activas'
const ALIVE_MS = 10 * 60000
type Alive = Record<string, { folder: string; seen: number }>

async function markAlive($: $T, alive: boolean) {
  const me = await $.session.id()
  const raw = await $.store.get(ALIVE_KEY)
  const list: Alive = raw && typeof raw === 'object' ? { ...(raw as Alive) } : {}
  const now = Date.now()
  for (const [id, v] of Object.entries(list)) if (now - v.seen > ALIVE_MS) delete list[id]
  if (alive) {
    const cwd = await $.session.cwd().catch(() => '')
    list[me] = { folder: cwd.split(/[\\/]/).filter(Boolean).pop() ?? '', seen: now }
  } else delete list[me]
  await $.store.set(ALIVE_KEY, list)
}

async function rateLimits($: $T): Promise<Limits> {
  const live = (await $.session.usage().catch(() => ({ rateLimits: [] as { kind: string; percentUsed: number; resetsAt?: string }[] }))).rateLimits
  const five = live.find(r => r.kind === 'five_hour')
  const week = live.find(r => r.kind === 'seven_day')
  if (five) {
    const saved = (await $.store.get(LAST_LIMITS_KEY)) as Limits | undefined
    const isNewer = !saved?.five?.resetsAt || !five.resetsAt || Date.parse(five.resetsAt) >= Date.parse(saved.five.resetsAt) - 30 * 60000
    if (isNewer) await $.store.set(LAST_LIMITS_KEY, { five, week })
    return { five, week }
  }
  const saved = (await $.store.get(LAST_LIMITS_KEY)) as Limits | undefined
  return saved ?? {}
}

async function refresh($: $T) {
  const { five, week } = await rateLimits($)
  if (!five) {
    await update($, status, () => L('Sin dato del bloque de 5 h aún: aparece con tu primer mensaje.', 'No 5-hour block data yet: it appears with your first message.'))
    return
  }
  const now = await $.clock.now()
  if (five.resetsAt && Date.parse(five.resetsAt) <= now) {
    const prev = await read($, snapshot)
    // Bloque nuevo: los frenos de 5 h ya no aplican; las pausas y los topes semanales se leen de nuevo.
    const rows = await Promise.all((prev?.sessions ?? []).map(async s => {
      const { stop, until, ...rest } = s
      const paused = !!(await $.store.get(pauseKey(s.id)))
      const keep = stop === 'semanal' ? { stop, until } : {}
      return { ...rest, pct: 0, bypass: false, paused, ...(paused ? { stop: 'pausa' as const } : keep) }
    }))
    await update($, snapshot, () => ({
      fiveHour: 0,
      resetsAt: null,
      weekly: week?.percentUsed ?? prev?.weekly ?? null,
      weeklyResetsAt: week?.resetsAt ?? prev?.weeklyResetsAt ?? null,
      current: 0,
      sessions: rows,
    }))
    await syncStop($)
    return
  }
  const since = five.resetsAt ? Date.parse(five.resetsAt) - FIVE_HOURS : now - FIVE_HOURS
  const root = $.plugin.root
  const { exitCode, stdout, stderr } = await $.process.run(
    ['node', `${root}/hooks/scan.js`, String(since), `${root}/.scan-cache.json`, String(week?.resetsAt ? Date.parse(week.resetsAt) - SEVEN_DAYS : 0)],
    { timeoutMs: 60000 },
  )
  if (exitCode !== 0) {
    await update($, status, () => L(`Error al leer registros: ${stderr.slice(0, 120)}`, `Error reading logs: ${stderr.slice(0, 120)}`))
    return
  }
  let parsed: unknown
  try { parsed = JSON.parse(stdout) } catch {
    await update($, status, () => L('Error al leer registros: salida incompleta.', 'Error reading logs: incomplete output.'))
    return
  }
  const scan = parsed as { sessions: { id: string; title: string | null; w: number }[]; weekly?: { id: string; title: string | null; ww: number }[]; titles?: Record<string, string>; usd?: { block: number; week: number } }
  const { sessions } = scan
  const titles = scan.titles ?? {}
  const total = sessions.reduce((s, x) => s + x.w, 0) || 1
  const weekList = scan.weekly ?? []
  const wtotal = weekList.reduce((s, x) => s + x.ww, 0) || 1
  const wpctOf = (id: string) => ((weekList.find(x => x.id === id)?.ww ?? 0) / wtotal) * (week?.percentUsed ?? 0)
  const me = await $.session.id()
  const extra = async (id: string) => {
    const cap = await capOf($, id)
    return {
      ...(cap !== undefined ? { cap } : {}),
      wpct: wpctOf(id),
      wcap: await wcapOf($, id),
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
  if (!shares.some(s => s.id === me)) shares.push({ id: me, title: titles[me] ?? L('Esta sesión', 'This session'), pct: 0, ...(await extra(me)) })
  // Sesiones abiertas que aún no gastan nada en este bloque (por ejemplo, recién creadas).
  const aliveRaw = await $.store.get(ALIVE_KEY)
  for (const [id, v] of Object.entries(aliveRaw && typeof aliveRaw === 'object' ? (aliveRaw as Alive) : {})) {
    if (shares.some(s => s.id === id) || Date.now() - v.seen > ALIVE_MS) continue
    shares.push({ id, title: titles[id] ?? (v.folder ? L(`Sesión en ${v.folder}`, `Session in ${v.folder}`) : L('Sesión sin uso aún', 'Session with no usage yet')), pct: 0, ...(await extra(id)) })
  }
  // Por qué está detenida cada sesión (mismas reglas que stopReason) y desde cuándo se reanuda sola.
  const wUntil = week?.resetsAt && Date.parse(week.resetsAt) > now ? new Date(Date.parse(week.resetsAt) + resumeMargin()).toISOString() : undefined
  const weekStop = async (sh: { id: string; wpct?: number; wcap?: number }) =>
    !!wUntil && (sh.wcap ?? 100) < 100 && (sh.wpct ?? 0) >= Math.max(0, (sh.wcap ?? 100) - CFG.closeMargin) &&
    !sameWeek(await $.store.get(wcapOkKey(sh.id)), week?.resetsAt)
  for (const sh of shares) {
    if (!(await weekStop(sh))) continue
    // Pausada y además sobre su tope semanal: se muestra la pausa, pero Reanudar también libera el tope.
    Object.assign(sh, sh.paused ? { wstop: true } : { stop: 'semanal', until: wUntil, wstop: true })
  }
  // La pausa se marca siempre, haya o no datos del bloque.
  for (const sh of shares) if (sh.paused && !(sh as { stop?: string }).stop) Object.assign(sh, { stop: 'pausa' })
  if (five.resetsAt) {
    const until = new Date(Date.parse(five.resetsAt) + resumeMargin()).toISOString()
    const approved = sameBlock(await $.store.get(APPROVED_KEY), five.resetsAt)
    const night = sleepsThrough(five.resetsAt)
    for (const sh of shares) {
      if ((sh as { stop?: string }).stop) continue
      const ok = (k: string) => $.store.get(k).then(v => sameBlock(v, five.resetsAt))
      let stop: 'pausa' | 'tope' | 'freno' | 'limite' | undefined
      // Con ∞ o en horario de sueño solo frena el límite real (100 % − margen de cierre).
      if (sh.bypass || night) { if (five.percentUsed >= 100 - CFG.closeMargin) stop = 'limite' }
      else if (five.percentUsed >= CFG.brakeAt && !approved && !(await ok(brakeOkKey(sh.id)))) stop = 'freno'
      else if (!night && sh.cap !== undefined && sh.pct >= Math.max(0, sh.cap - CFG.closeMargin) && !(await ok(capOkKey(sh.id)))) stop = 'tope'
      if (stop) Object.assign(sh, { stop, until })
    }
  }
  // Se guardan todas (hasta 40, de más a menos uso); la franja muestra las que caben.
  const kept = shares.slice(0, 40)
  if (!kept.some(s => s.id === me)) kept[kept.length - 1] = shares.find(s => s.id === me)!
  const next: Snapshot = {
    fiveHour: five.percentUsed,
    resetsAt: five.resetsAt ?? null,
    weekly: week?.percentUsed ?? null,
    weeklyResetsAt: week?.resetsAt ?? null,
    current: shares.find(s => s.id === me)?.pct ?? 0,
    sessions: kept,
    ...(scan.usd && week?.resetsAt ? { weekUsd: scan.usd.week } : {}),
    week: await Promise.all([
      ...weekList.slice(0, 12).map(w => shares.find(s => s.id === w.id) ?? { id: w.id, title: w.title ?? titles[w.id] ?? w.id.slice(0, 8), pct: 0, wpct: wpctOf(w.id) } as SessionShare),
      ...shares.filter(s => !weekList.slice(0, 12).some(w => w.id === s.id)),
    ].map(async s => ({ ...s, wcap: (s as SessionShare).wcap ?? (await wcapOf($, s.id)) }))),
  }
  await update($, snapshot, () => next)
  if (next.resetsAt) await recordHistory($, next)
  await warnNearCap($, next)
  await warnNearWeekCap($, next)
  // La cabecera muestra el motivo del freno apenas cambian los datos.
  await syncStop($)
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
  $.ui.toast(L(`Esta sesión va en ${fmt(snap.current)} % del bloque: cerca de su tope de ${fmt(cap)} %.`, `This session is at ${fmt(snap.current)} % of the block: close to its ${fmt(cap)} % cap.`))
}

// Un aviso por semana cuando esta sesión pasa el % de aviso de su tope semanal.
async function warnNearWeekCap($: $T, snap: Snapshot) {
  const id = await $.session.id()
  const s = snap.sessions.find(x => x.id === id)
  if (!s || !snap.weeklyResetsAt || (s.wcap ?? 100) >= 100 || (s.wpct ?? 0) < (s.wcap ?? 100) * (CFG.warnPct / 100)) return
  if (sameWeek(await read($, warnedWeek), snap.weeklyResetsAt)) return
  await update($, warnedWeek, () => snap.weeklyResetsAt!)
  $.ui.toast(L(`Esta sesión va en ${fmt(s.wpct ?? 0)} % del límite semanal: cerca de su tope semanal de ${fmt(s.wcap ?? 100)} %.`,
    `This session is at ${fmt(s.wpct ?? 0)} % of the weekly limit: close to its ${fmt(s.wcap ?? 100)} % weekly cap.`))
}

// Sube o baja el tope de una sesión de a 10 %; bajo 10 queda sin tope.
// Corrige una fila del desglose al instante; el recálculo completo llega después.
async function patchRow($: $T, id: string, fn: (s: Snapshot['sessions'][number]) => Snapshot['sessions'][number]) {
  await update($, snapshot, snap => (snap ? { ...snap, sessions: snap.sessions.map(s => (s.id === id ? fn(s) : s)) } : snap))
}

async function stepCap($: $T, id: string, dir: 1 | -1) {
  await loadCfg($)
  const cur = await capOf($, id)
  const base = cur ?? 100
  const n = base + dir * CFG.capStep
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

async function stepWeekCap($: $T, id: string, dir: 1 | -1) {
  await loadCfg($)
  const next = Math.max(CFG.capStep >= 100 ? 1 : CFG.capStep, Math.min(100, (await wcapOf($, id)) + dir * CFG.capStep))
  await $.store.set(wcapKey(id), next)
  await $.store.delete(wcapOkKey(id))
  await update($, snapshot, snap => (snap ? {
    ...snap,
    week: snap.week?.map(s => (s.id === id ? { ...s, wcap: next } : s)),
    sessions: snap.sessions.map(s => (s.id === id ? { ...s, wcap: next } : s)),
  } : snap))
  void refresh($).catch(() => {})
  await syncStop($)
}

// Calcula (una vez) el costo de una semana pasada leyendo los registros, y lo guarda.
async function loadWeekCost($: $T, endIso: string) {
  const saved = await $.store.get(WEEK_COSTS_KEY)
  const all = saved && typeof saved === 'object' ? (saved as Record<string, number>) : {}
  if (typeof all[endIso] !== 'number') {
    const end = Date.parse(endIso)
    const r = await $.process.run(['node', `${$.plugin.root}/hooks/scan.js`, 'cost', String(end - SEVEN_DAYS), String(end)], { timeoutMs: 120000 })
    let v = -1
    try { if (r.exitCode === 0) v = Number((JSON.parse(r.stdout) as { usd: number }).usd) } catch {}
    all[endIso] = Number.isFinite(v) ? v : -1
    await $.store.set(WEEK_COSTS_KEY, all)
  }
  await update($, weekCosts, () => ({ ...all }))
}

const usd = (n: number) => `US$ ${n >= 100 ? Math.round(n).toLocaleString(CFG.lang === 'en' ? 'en-US' : 'es-CL') : (CFG.lang === 'en' ? n.toFixed(2) : n.toFixed(2).replace('.', ','))}`

// Horario de sueño (horas locales; se apaga con su interruptor o con inicio = fin). Si el bloque de 5 h se reinicia dentro de él,
// el freno global y los topes de 5 h por sesión no aplican: la reserva no se usaría mientras duermes.
// Las sesiones igual se detienen en 100 % − margen de cierre, antes del corte de Anthropic.
function sleepsThrough(resetIso: string | null | undefined) {
  if (!resetIso || !CFG.sleepOn || CFG.sleepStart === CFG.sleepEnd) return false
  const d = new Date(resetIso)
  const h = d.getHours() + d.getMinutes() / 60
  return CFG.sleepStart < CFG.sleepEnd ? h >= CFG.sleepStart && h < CFG.sleepEnd : h >= CFG.sleepStart || h < CFG.sleepEnd
}

async function activeTest($: $T) {
  const t = await read($, test)
  if (t && Date.parse(t.resetsAt) + resumeMargin() < Date.now()) {
    await update($, test, () => null)
    return null
  }
  return t
}

async function limit($: $T) {
  const t = await activeTest($)
  if (t) return { pct: t.pct, resetsAt: t.resetsAt }
  const { five } = await rateLimits($)
  return five?.resetsAt ? { pct: five.percentUsed, resetsAt: five.resetsAt } : null
}

// Qué detiene a esta sesión ahora: una pausa, el freno global o su tope propio.
async function stopReason($: $T): Promise<{ kind: string; text: string; until?: number } | null> {
  // Ajustes al día: el horario de sueño y el freno dependen de ellos.
  await loadCfg($)
  const me = await $.session.id()
  if (await $.store.get(pauseKey(me))) {
    return { kind: 'pausa', text: L(`Sesión pausada con ${C('uso-pausar')}. Se reanuda con ${C('uso-reanudar')}.`, `Session paused with ${C('uso-pausar')}. Resume it with ${C('uso-reanudar')}.`) }
  }
  const snapNow = await read($, snapshot)
  const wrow = snapNow?.sessions.find(s => s.id === me)
  const wreset = snapNow?.weeklyResetsAt
  if (wreset && Date.parse(wreset) + resumeMargin() > Date.now() && wrow && (wrow.wcap ?? 100) < 100 && (wrow.wpct ?? 0) >= Math.max(0, (wrow.wcap ?? 100) - CFG.closeMargin) &&
    !sameWeek(await $.store.get(wcapOkKey(me)), wreset)) {
    const until = Date.parse(wreset) + resumeMargin()
    const at = dayHour(new Date(until).toISOString())
    return { kind: 'semanal', until, text: L(`Tope semanal de esta sesión: lleva ${fmt(wrow.wpct ?? 0)} % del límite semanal (tope ${fmt(wrow.wcap ?? 100)} %). Se reanuda sola el ${at}, tras el reinicio semanal; ${C('uso-continuar')} la libera antes.`,
      `This session's weekly cap: it has used ${fmt(wrow.wpct ?? 0)} % of the weekly limit (cap ${fmt(wrow.wcap ?? 100)} %). It resumes on its own on ${at}, after the weekly reset; ${C('uso-continuar')} releases it sooner.`) }
  }
  const l = await limit($)
  if (!l || Date.parse(l.resetsAt) + resumeMargin() <= Date.now()) return null
  const resumeAt = hhmm(new Date(Date.parse(l.resetsAt) + resumeMargin()).toISOString())
  const bypass = sameBlock(await $.store.get(bypassKey(me)), l.resetsAt)
  const night = sleepsThrough(l.resetsAt)
  if (night && !bypass && l.pct >= 100 - CFG.closeMargin) {
    return { kind: 'limite', text: L(`Límite real cerca: el bloque de 5 h va en ${fmt(l.pct)} % (horario de sueño: sin freno global ni topes de 5 h). La sesión se detiene antes del corte de Anthropic y se reanuda sola a las ${resumeAt}.`,
      `Real limit close: the 5-hour block is at ${fmt(l.pct)} % (sleep hours: no global brake or 5-hour caps). The session stops before Anthropic's cutoff and resumes on its own at ${resumeAt}.`) }
  }
  if (bypass && l.pct >= 100 - CFG.closeMargin) {
    return { kind: 'limite', text: L(`Límite real cerca: el bloque de 5 h va en ${fmt(l.pct)} % y esta sesión (sin freno global) se detiene antes del corte de Anthropic. Se reanuda sola a las ${resumeAt}.`,
      `Real limit close: the 5-hour block is at ${fmt(l.pct)} % and this session (no global brake) stops before Anthropic's cutoff. It resumes on its own at ${resumeAt}.`) }
  }
  const brakeOk = bypass || sameBlock(await $.store.get(APPROVED_KEY), l.resetsAt) || sameBlock(await $.store.get(brakeOkKey(me)), l.resetsAt)
  if (!night && l.pct >= CFG.brakeAt && !brakeOk) {
    const free = ((await read($, snapshot))?.sessions ?? []).filter(s => s.bypass).map(s => s.title)
    return { kind: 'freno', text: L(`Freno de uso: el bloque de 5 h va en ${fmt(l.pct)} % (freno ${CFG.brakeAt} %).${free.length ? ` Sigue sin freno: ${free.join(', ')}.` : ''} Se reanuda sola a las ${resumeAt}; ${C('uso-continuar')} la libera antes.`,
      `Usage brake: the 5-hour block is at ${fmt(l.pct)} % (brake ${CFG.brakeAt} %).${free.length ? ` Still without brake: ${free.join(', ')}.` : ''} It resumes on its own at ${resumeAt}; ${C('uso-continuar')} releases it sooner.`) }
  }
  const cap = await capOf($, me)
  const mine = (await read($, snapshot))?.current ?? 0
  if (!night && cap !== undefined && mine >= Math.max(0, cap - CFG.closeMargin) && !sameBlock(await $.store.get(capOkKey(me)), l.resetsAt)) {
    return { kind: 'tope', text: L(`Tope de esta sesión: lleva ${fmt(mine)} % del bloque de 5 h (tope ${fmt(cap)} %). Se reanuda sola tras el reinicio; ${C('uso-continuar')} la libera antes.`,
      `This session's cap: it has used ${fmt(mine)} % of the 5-hour block (cap ${fmt(cap)} %). It resumes on its own after the reset; ${C('uso-continuar')} releases it sooner.`) }
  }
  return null
}

async function syncStop($: $T) {
  const r = await stopReason($)
  const braked = r !== null
  if (braked !== (await read($, isBraked))) await update($, isBraked, () => braked)
  const l = await limit($)
  const at = r?.until ?? (r && r.kind !== 'pausa' && l ? Date.parse(l.resetsAt) + resumeMargin() : 0)
  if (at !== (await read($, resumeAt))) await update($, resumeAt, () => at)
  return r
}

// ---------- Prompts programados ----------

async function schedList($: { store: { get: (k: string) => Promise<unknown> } }): Promise<Scheduled[]> {
  const raw = await $.store.get(SCHED_KEY)
  return Array.isArray(raw) ? (raw as Scheduled[]) : []
}

async function schedSave($: $T, list: Scheduled[]) {
  await $.store.set(SCHED_KEY, list)
  await update($, schedRev, n => n + 1)
}

// Cuándo sale un prompt con hora propia: el próximo reinicio del bloque o de la semana (con el margen de
// reanudación) o la próxima vez que el reloj marque esa hora. Sin dato del reinicio, sale apenas se pueda.
async function schedAt($: $T, type: Scheduled['type'], time: string) {
  const now = Date.now()
  if (type === 'time') {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(now)
    d.setHours(h!, m!, 0, 0)
    if (d.getTime() <= now) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  const snap = await read($, snapshot)
  const iso = type === 'week' ? snap?.weeklyResetsAt : snap?.resetsAt
  return iso && Date.parse(iso) > now ? Date.parse(iso) + resumeMargin() : now
}

// Orden de una sesión: los de hora propia por hora de envío; cada uno seguido de sus seguimientos, en cadena.
function schedOrdered(list: Scheduled[], sid: string) {
  const own = list.filter(i => i.sid === sid)
  const ids = new Set(own.map(i => i.id))
  const out: { item: Scheduled; depth: number }[] = []
  const walk = (parent: string, depth: number) => {
    for (const i of own.filter(x => x.after === parent)) { out.push({ item: i, depth }); walk(i.id, depth + 1) }
  }
  for (const r of own.filter(i => !i.after || !ids.has(i.after)).sort((a, b) => a.at - b.at)) { out.push({ item: r, depth: 0 }); walk(r.id, 1) }
  return out
}

function schedLabel(i: Scheduled) {
  if (i.held) return L('En espera · el anterior no terminó', 'On hold · the previous one did not finish')
  if (i.after) return L('Después del anterior', 'After the previous one')
  const iso = new Date(i.at).toISOString()
  if (i.type === 'next') return L(`Próximo bloque · ${hhmm(iso)}`, `Next block · ${hhmm(iso)}`)
  if (i.type === 'week') return L(`Semanal · ${dayHour(iso)}`, `Weekly · ${dayHour(iso)}`)
  const today = new Date().toDateString() === new Date(i.at).toDateString()
  const tomorrow = new Date(Date.now() + 86400e3).toDateString() === new Date(i.at).toDateString()
  return today ? L(`Hoy ${hhmm(iso)}`, `Today ${hhmm(iso)}`) : tomorrow ? L(`Mañana ${hhmm(iso)}`, `Tomorrow ${hhmm(iso)}`) : dayHour(iso)
}

// Guarda el borrador del cuadro abierto: nuevo, editado o seguimiento de otro prompt.
async function schedSubmit($: $T) {
  const ui = await read($, schedUi)
  const d = { ...(await read($, schedDraft)), ...schedTyped }
  if (!ui) return
  const text = d.text.trim()
  if (!text) return void update($, schedErr, () => L('Escribe el prompt primero.', 'Write the prompt first.'))
  if (d.type === 'time' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(d.time.trim())) return void update($, schedErr, () => L('Escribe la hora como 07:30.', 'Write the time like 07:30.'))
  const list = await schedList($)
  const time = d.time.trim().padStart(5, '0')
  if (ui.mode === 'edit') {
    const it = list.find(i => i.id === ui.id)
    if (it) {
      it.text = text
      if (!it.after) Object.assign(it, { type: d.type, time, at: await schedAt($, d.type, time), held: false })
    }
  } else if (ui.mode === 'follow') {
    const parent = list.find(i => i.id === ui.id)
    if (!parent) return void update($, schedUi, () => null)
    const id = `p${Date.now().toString(36)}`
    // Entra justo después de su padre: lo que antes seguía al padre ahora sigue al nuevo.
    for (const c of list) if (c.after === parent.id) c.after = id
    list.push({ id, sid: ui.sid, text, type: parent.type, at: parent.at, after: parent.id })
  } else {
    list.push({ id: `p${Date.now().toString(36)}`, sid: ui.sid, text, type: d.type, time, at: await schedAt($, d.type, time), after: null })
  }
  await schedSave($, list)
  await update($, schedErr, () => '')
  await update($, schedUi, () => null)
  schedTyped = {}
}

// Cancela un prompt; sus seguimientos no se pierden: suben un nivel y, si quedan arriba, heredan su hora.
async function schedDelete($: $T, id: string) {
  const list = await schedList($)
  const it = list.find(i => i.id === id)
  if (!it) return
  for (const c of list) if (c.after === id) Object.assign(c, it.after ? { after: it.after } : { after: null, type: it.type, time: it.time, at: it.at })
  await schedSave($, list.filter(i => i !== it))
}

async function schedOpen($: $T, ui: SchedUi) {
  const cur = await read($, schedUi)
  const same = cur && cur.mode === ui.mode && cur.sid === ui.sid && cur.id === ui.id
  await update($, schedErr, () => '')
  schedTyped = {}
  if (same) return void update($, schedUi, () => null)
  const it = ui.id ? (await schedList($)).find(i => i.id === ui.id) : undefined
  await update($, schedDraft, () => (ui.mode === 'edit' && it ? { text: it.text, type: it.type, time: it.time ?? '07:30' } : { text: '', type: 'next', time: '07:30' }))
  await update($, schedUi, () => ui)
}

// Mantener el equipo despierto mientras esta sesión tenga prompts programados: un proceso que lo pide al
// sistema (Windows, macOS o Linux) y que se termina cuando ya no hacen falta.
const AWAKE_PS = "Add-Type -Name P -Namespace W -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; while ($true) { [void][W.P]::SetThreadExecutionState([uint32]2147483649); 'tick'; Start-Sleep -Seconds 30 }"
const AWAKE_LOOP = 'while true; do echo tick; sleep 30; done'
const AWAKE_ARGV = [
  ['powershell', '-NoProfile', '-NonInteractive', '-Command', AWAKE_PS],
  ['caffeinate', '-i', 'sh', '-c', AWAKE_LOOP],
  ['systemd-inhibit', '--what=sleep:idle', '--why=uso-por-sesion', 'sh', '-c', AWAKE_LOOP],
]
let awake: { stop: boolean } | null = null
// Si ningún sistema aceptó mantenerlo despierto, no se vuelve a intentar en esta sesión.
let awakeUnavailable = false
function keepAwake($: $T, on: boolean) {
  if (!on) {
    if (awake) awake.stop = true
    awake = null
    return
  }
  if (awake || awakeUnavailable) return
  const h = { stop: false }
  awake = h
  void (async () => {
    for (const argv of AWAKE_ARGV) {
      let ticked = false
      try {
        for await (const _ of $.process.spawn({ argv })) {
          ticked = true
          if (h.stop) break
        }
      } catch {}
      if (ticked || h.stop) break
      if (argv === AWAKE_ARGV[AWAKE_ARGV.length - 1]) awakeUnavailable = true
    }
    if (awake === h) awake = null
  })()
}

// Envía, en esta sesión, el próximo prompt que toca: un seguimiento cuyo anterior ya tuvo respuesta, o uno
// cuya hora llegó. Nunca mientras la sesión está frenada o pausada: espera a que nada la frene.
// Un solo envío a la vez: dos revisiones simultáneas (el minuto y el fin de un turno) no mandan dos veces lo mismo.
let firing = false
async function schedFire($: $T) {
  if (firing) return false
  firing = true
  try {
    return await schedFireOnce($)
  } finally {
    firing = false
  }
}

async function schedFireOnce($: $T) {
  const me = await $.session.id()
  const list = await schedList($)
  const mine = list.filter(i => i.sid === me)
  keepAwake($, mine.some(i => !i.held))
  if (!mine.length || (await read($, schedActive))) return false
  const busy = await read($, busyAt)
  if (busy && Date.now() - busy < BUSY_MAX) return false
  if (await stopReason($)) return false
  const ids = new Set(list.map(i => i.id))
  const due = mine.filter(i => !i.held && (!i.after || !ids.has(i.after)) && i.at <= Date.now()).sort((a, b) => a.at - b.at)[0]
  if (!due) return false
  await schedSave($, list.filter(i => i !== due))
  await update($, schedActive, () => due.id)
  // El prompt programado reemplaza al aviso de "continúa donde quedaste".
  await update($, stoppedBy, () => '')
  await $.prompt.submit({ text: due.text })
  return true
}

// Al terminar un turno de la sesión (no de un subagente): los seguimientos del prompt enviado salen de
// inmediato si el turno terminó con respuesta. Si el freno o una pausa lo cortaron, primero se retoma el
// prompt ("continúa donde quedaste") y la cola sigue cuando ese turno termina. Si lo interrumpiste tú o
// hubo un error, los seguimientos quedan en espera hasta que les des hora.
async function schedTurnDone($: $T, reason: string) {
  const active = await read($, schedActive)
  if (active) {
    if (await read($, stoppedBy)) return
    const list = await schedList($)
    const answered = reason === 'answer'
    for (const c of list) if (c.after === active) Object.assign(c, { after: null, at: 0 }, answered ? {} : { held: true })
    await schedSave($, list)
    await update($, schedActive, () => '')
  }
  await schedFire($)
}

// Cada minuto: si esta sesión se detuvo trabajando y ya nada la frena, retoma la tarea.
async function maybeResume($: $T) {
  const was = await read($, stoppedBy)
  if (!was || (await syncStop($))) return
  await update($, stoppedBy, () => '')
  await update($, test, () => null)
  await $.prompt.submit({ text: RESUME_TEXT()[was] ?? RESUME_TEXT().pausa! })
}

// Pausa o reanuda una sesión desde los botones del desglose.
async function setPaused($: $T, id: string, paused: boolean) {
  if (paused) await $.store.set(pauseKey(id), true)
  else await $.store.delete(pauseKey(id))
  await patchRow($, id, s => {
    const { stop: _s, until: _u, ...rest } = s
    return paused ? { ...rest, paused, stop: 'pausa' as const } : { ...rest, paused }
  })
  void refresh($).catch(() => {})
  await maybeResume($)
  await syncStop($)
}

// Reanuda una sesión detenida desde su botón: quita la pausa o la libera del freno y del tope hasta el reinicio.
async function releaseSession($: $T, id: string) {
  const snap = await read($, snapshot)
  const row = snap?.sessions.find(s => s.id === id) ?? snap?.week?.find(s => s.id === id)
  await $.store.delete(pauseKey(id))
  if ((row?.wstop || row?.stop === 'semanal') && snap?.weeklyResetsAt) await $.store.set(wcapOkKey(id), snap.weeklyResetsAt)
  if (row?.stop && row.stop !== 'pausa' && row.stop !== 'semanal' && snap?.resetsAt) {
    await $.store.set(brakeOkKey(id), snap.resetsAt)
    await $.store.set(capOkKey(id), snap.resetsAt)
  }
  await patchRow($, id, s => {
    const { stop: _s, until: _u, wstop: _w, ...rest } = s
    return { ...rest, paused: false }
  })
  void refresh($).catch(() => {})
  await maybeResume($)
  await syncStop($)
}

// Pausa todas, o las reanuda todas: quita pausas y libera freno y topes hasta el reinicio.
async function setAll($: $T, paused: boolean) {
  const snap = await read($, snapshot)
  const list = snap?.sessions ?? []
  for (const s of list) {
    if (paused) await $.store.set(pauseKey(s.id), true)
    else {
      await $.store.delete(pauseKey(s.id))
      if (snap?.resetsAt) {
        await $.store.set(brakeOkKey(s.id), snap.resetsAt)
        await $.store.set(capOkKey(s.id), snap.resetsAt)
      }
      if ((s.wstop || s.stop === 'semanal') && snap?.weeklyResetsAt) await $.store.set(wcapOkKey(s.id), snap.weeklyResetsAt)
    }
  }
  if (!paused && snap?.resetsAt) await $.store.set(APPROVED_KEY, snap.resetsAt)
  await update($, snapshot, sn => (sn ? { ...sn, sessions: sn.sessions.map(s => {
    const { stop: _s, until: _u, wstop: _w, ...rest } = s
    return paused ? { ...rest, paused: true, stop: 'pausa' as const } : { ...rest, paused: false }
  }) } : sn))
  void refresh($).catch(() => {})
  await maybeResume($)
  await syncStop($)
}

// Activa o quita el ∞ (sin freno global) de una sesión: hasta CFG.maxBypass a la vez, con un segundo toque para confirmar.
async function toggleBypass($: $T, id: string) {
  await loadCfg($)
  // Usa el reinicio del snapshot: desde un botón, leer el uso de la sesión puede no estar permitido.
  const snap = await read($, snapshot)
  const t = await activeTest($)
  const l = t ? { resetsAt: t.resetsAt } : snap?.resetsAt ? { resetsAt: snap.resetsAt } : await limit($).catch(() => null)
  if (!l) return void $.ui.toast(L('Aún no hay dato del bloque de 5 h.', 'No 5-hour block data yet.'))
  const list = snap?.sessions ?? []
  const title = list.find(s => s.id === id)?.title ?? L('esta sesión', 'this session')
  if (sameBlock(await $.store.get(bypassKey(id)), l.resetsAt)) {
    await $.store.delete(bypassKey(id))
    await update($, armed, () => '')
    await patchRow($, id, s => ({ ...s, bypass: false }))
    void refresh($).catch(() => {})
    await syncStop($)
    $.ui.toast(L(`${title} vuelve a respetar el freno global.`, `${title} respects the global brake again.`))
    return
  }
  const active = list.filter(s => s.bypass && s.id !== id)
  if (CFG.maxBypass <= 0) return void $.ui.toast(L('Sin freno global está desactivado en Configuración.', 'No global brake is turned off in Settings.'))
  if (active.length >= CFG.maxBypass) {
    return void $.ui.toast(L(`Ya ${active.length === 1 ? 'hay 1 sesión' : `hay ${active.length} sesiones`} sin freno: ${active.map(s => s.title).join(', ')}. Desactívala primero.`,
      `${active.length === 1 ? '1 session is' : `${active.length} sessions are`} already without brake: ${active.map(s => s.title).join(', ')}. Turn it off first.`))
  }
  await update($, armed, () => '')
  await $.store.set(bypassKey(id), l.resetsAt)
  await patchRow($, id, s => ({ ...s, bypass: true }))
  void refresh($).catch(() => {})
  await syncStop($)
  await maybeResume($)
  $.ui.toast(L(`${title} queda sin freno global hasta el reinicio de las ${hhmm(l.resetsAt)}.`, `${title} ignores the global brake until the ${hhmm(l.resetsAt)} reset.`))
}

// Sesiones de la última lista del desglose: un número (1, 2…), "todas" o vacío (esta sesión).
async function targets($: $T, arg: string) {
  const me = await $.session.id()
  const list = (await read($, snapshot))?.sessions ?? []
  const a = arg.trim().toLowerCase()
  if (!a) return [{ id: me, title: L('esta sesión', 'this session') }]
  if (isAllArg(a)) return list.map(s => ({ id: s.id, title: s.title }))
  const n = Number(a)
  const s = list[n - 1]
  return Number.isInteger(n) && s ? [{ id: s.id, title: s.title }] : []
}

// ---------- Comandos de prompts programados (lo mismo que ✉, ✎, + y ✕) ----------

// Sesión a la que apunta un primer argumento numérico ("2 bloque ...") o esta sesión; devuelve el resto.
async function schedTarget($: $T, args: string) {
  const rest = args.trim()
  const m = rest.match(/^(\d+)\s+([\s\S]*)$/)
  if (m && !/^\d{1,2}:\d{2}/.test(rest)) {
    const t = (await targets($, m[1]!))[0]
    return t ? { sid: t.id, title: t.title, rest: m[2]!.trim() } : null
  }
  return { sid: await $.session.id(), title: L('esta sesión', 'this session'), rest }
}

function schedWhen(w: string): { type: Scheduled['type']; time: string } | null {
  const v = w.toLowerCase()
  if (['bloque', 'block', 'next', 'proximo', 'próximo'].includes(v)) return { type: 'next', time: '07:30' }
  if (['semana', 'semanal', 'week', 'weekly'].includes(v)) return { type: 'week', time: '07:30' }
  if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) return { type: 'time', time: v.padStart(5, '0') }
  return null
}

const schedUsage = () => L(`Uso: ${C('uso-programar')} [n°] <bloque | semana | 07:30> <texto>. Recuerda Esc antes de Enter.`,
  `Usage: ${C('uso-programar')} [n] <block | week | 07:30> <text>. Remember Esc before Enter.`)

const cmdUsoProgramar: Hook<'command.run'> = async ($, e) => {
  const t = await schedTarget($, e.args)
  if (!t) return { text: notFound() }
  const w = t.rest.split(/\s+/)[0] ?? ''
  const when = schedWhen(w)
  const text = t.rest.slice(w.length).trim()
  if (!when || !text) return { text: schedUsage() }
  const list = await schedList($)
  const it: Scheduled = { id: `p${Date.now().toString(36)}`, sid: t.sid, text, type: when.type, time: when.time, at: await schedAt($, when.type, when.time), after: null }
  list.push(it)
  await schedSave($, list)
  void schedFire($).catch(() => false)
  return { text: L(`Programado en ${t.title}: ${schedLabel(it)}.`, `Scheduled in ${t.title}: ${schedLabel(it)}.`) }
}

// Cola numerada de esta sesión (o la n°), en el mismo orden que el panel.
const cmdUsoProgramados: Hook<'command.run'> = async ($, e) => {
  const a = e.args.trim()
  const t = a ? (await targets($, a))[0] : { id: await $.session.id(), title: L('esta sesión', 'this session') }
  if (!t) return { text: notFound() }
  const q = schedOrdered(await schedList($), t.id)
  if (!q.length) return { text: L(`No hay prompts programados en ${t.title}.`, `No prompts scheduled in ${t.title}.`) }
  const lines = q.map(({ item, depth }, k) => `${k + 1}. ${'  '.repeat(depth)}${schedLabel(item)}: ${item.text.length > 60 ? item.text.slice(0, 59) + '…' : item.text}`)
  return { text: [L(`Programados en ${t.title}:`, `Scheduled in ${t.title}:`), ...lines].join('\n') }
}

const cmdUsoCancelar: Hook<'command.run'> = async ($, e) => {
  const me = await $.session.id()
  const a = e.args.trim()
  const list = await schedList($)
  if (isAllArg(a)) {
    const n = list.filter(i => i.sid === me).length
    await schedSave($, list.filter(i => i.sid !== me))
    return { text: L(`Cancelados ${n} prompts de esta sesión.`, `Canceled ${n} prompts in this session.`) }
  }
  const item = schedOrdered(list, me)[Number(a) - 1]?.item
  if (!a || !item) return { text: L(`Uso: ${C('uso-cancelar')} <n° de ${C('uso-programados')}> o todos.`, `Usage: ${C('uso-cancelar')} <n from ${C('uso-programados')}> or all.`) }
  await schedDelete($, item.id)
  return { text: L(`Cancelado: ${schedLabel(item)}.`, `Canceled: ${schedLabel(item)}.`) }
}

const cmdUsoSeguimiento: Hook<'command.run'> = async ($, e) => {
  const me = await $.session.id()
  const m = e.args.trim().match(/^(\d+)\s+([\s\S]+)$/)
  const list = await schedList($)
  const parent = m ? schedOrdered(list, me)[Number(m[1]) - 1]?.item : undefined
  if (!m || !parent) return { text: L(`Uso: ${C('uso-seguimiento')} <n° de ${C('uso-programados')}> <texto>.`, `Usage: ${C('uso-seguimiento')} <n from ${C('uso-programados')}> <text>.`) }
  const id = `p${Date.now().toString(36)}`
  for (const c of list) if (c.after === parent.id) c.after = id
  list.push({ id, sid: me, text: m[2]!.trim(), type: parent.type, at: parent.at, after: parent.id })
  await schedSave($, list)
  return { text: L('Seguimiento agregado: sale cuando Claude termine de responder el anterior.', 'Follow-up added: sent when Claude finishes answering the previous one.') }
}

// Handlers de comandos: cada uno se registra con su nombre en español y su alias en inglés.
const notFound = () => L('No encontré esa sesión. Usa el n° del desglose, "todas" o nada para esta sesión.', 'Session not found. Use the number from the list, "all", or nothing for this session.')

const cmdUsoContinuar: Hook<'command.run'> = async ($, e) => {
  const l = await limit($)
  if (!l) return { text: L('Aún no hay dato del bloque de 5 h.', 'No 5-hour block data yet.') }
  const isAll = isAllArg(e.args)
  const list = await targets($, e.args)
  if (!list.length) return { text: notFound() }
  if (isAll) await $.store.set(APPROVED_KEY, l.resetsAt)
  const cur = await read($, snapshot)
  const wr = cur?.weeklyResetsAt
  for (const t of list) {
    await $.store.set(brakeOkKey(t.id), l.resetsAt)
    await $.store.set(capOkKey(t.id), l.resetsAt)
    // El tope semanal se libera solo si es lo que la tiene detenida (si no, seguiría desactivado toda la semana).
    const row = cur?.sessions.find(s => s.id === t.id)
    if (wr && (row?.wstop || row?.stop === 'semanal')) await $.store.set(wcapOkKey(t.id), wr)
  }
  await maybeResume($)
  await syncStop($)
  const who = isAll ? L('todas las sesiones', 'all sessions') : list.map(t => t.title).join(', ')
  return { text: L(`Freno y tope liberados para ${who} hasta el reinicio de las ${hhmm(l.resetsAt)}.`, `Brake and cap released for ${who} until the ${hhmm(l.resetsAt)} reset.`) }
}

const cmdUsoLimite: Hook<'command.run'> = async ($, e) => {
  const me = await $.session.id()
  const a0 = e.args.trim().toLowerCase().replace('%', '').replace(',', '.')
  const wk = a0.match(/^(semanal|weekly)\s*(.*)$/)
  if (wk) {
    const v = wk[2]!.trim()
    const c = `${C('uso-limite')} ${L('semanal', 'weekly')}`
    if (!v) {
      const w = await wcapOf($, me)
      return { text: w < 100 ? L(`Tope semanal de esta sesión: ${fmt(w)} % del límite semanal.`, `This session's weekly cap: ${fmt(w)} % of the weekly limit.`) : L(`Esta sesión no tiene tope semanal. Ponle uno con ${c} <n>.`, `This session has no weekly cap. Set one with ${c} <n>.`) }
    }
    const off = ['quitar', 'remove', 'off'].includes(v)
    const n = off ? 100 : Number(v)
    if (!(n > 0 && n <= 100)) return { text: L(`Uso: ${c} 20 (porcentaje del límite semanal) o ${c} quitar.`, `Usage: ${c} 20 (percent of the weekly limit) or ${c} remove.`) }
    await $.store.set(wcapKey(me), n)
    await $.store.delete(wcapOkKey(me))
    await refresh($).catch(() => {})
    await syncStop($)
    return { text: n >= 100 ? L('Tope semanal de esta sesión quitado.', "This session's weekly cap removed.") : L(`Tope semanal de esta sesión: ${fmt(n)} % del límite semanal.`, `This session's weekly cap: ${fmt(n)} % of the weekly limit.`) }
  }
  const a = a0
  if (!a) {
    const cap = await capOf($, me)
    const c = C('uso-limite')
    return { text: (cap !== undefined
      ? L(`Tope de esta sesión: ${fmt(cap)} % del bloque de 5 h. Cámbialo con ${c} <n> o quítalo con ${c} quitar.`, `This session's cap: ${fmt(cap)} % of the 5-hour block. Change it with ${c} <n> or remove it with ${c} remove.`)
      : L(`Esta sesión no tiene tope. Ponle uno con ${c} <n>, por ejemplo ${c} 20.`, `This session has no cap. Set one with ${c} <n>, for example ${c} 20.`)) }
  }
  if (a === 'quitar' || a === 'remove' || a === 'off') {
    await $.store.set(capKey(me), 0)
    await refresh($).catch(() => {})
    await syncStop($)
    return { text: L('Tope de esta sesión quitado.', "This session's cap removed.") }
  }
  const n = Number(a)
  if (!(n > 0 && n <= 100)) return { text: L(`Uso: ${C('uso-limite')} 40 (porcentaje del bloque de 5 h) o ${C('uso-limite')} quitar.`, `Usage: ${C('uso-limite')} 40 (percent of the 5-hour block) or ${C('uso-limite')} remove.`) }
  await $.store.set(capKey(me), n)
  await $.store.delete(capOkKey(me))
  await refresh($).catch(() => {})
  await syncStop($)
  return { text: L(`Tope de esta sesión: ${fmt(n)} % del bloque de 5 h.`, `This session's cap: ${fmt(n)} % of the 5-hour block.`) }
}

const cmdUsoPausar: Hook<'command.run'> = async ($, e) => {
  const list = await targets($, e.args)
  if (!list.length) return { text: notFound() }
  for (const t of list) await $.store.set(pauseKey(t.id), true)
  await refresh($).catch(() => {})
  await syncStop($)
  return { text: L(`Pausada(s): ${list.map(t => t.title).join(', ')}. Se detienen en su próximo paso.`, `Paused: ${list.map(t => t.title).join(', ')}. They stop at their next step.`) }
}

const cmdUsoReanudar: Hook<'command.run'> = async ($, e) => {
  const list = await targets($, e.args)
  if (!list.length) return { text: notFound() }
  for (const t of list) await $.store.delete(pauseKey(t.id))
  await refresh($).catch(() => {})
  await maybeResume($)
  await syncStop($)
  return { text: L(`Reanudada(s): ${list.map(t => t.title).join(', ')}. Las que estaban trabajando retoman en menos de un minuto.`, `Resumed: ${list.map(t => t.title).join(', ')}. Those that were working pick up again in under a minute.`) }
}

const cmdUsoPruebaFreno: Hook<'command.run'> = async $ => {
  if (await read($, test)) {
    await update($, test, () => null)
    await update($, stoppedBy, () => '')
    await syncStop($)
    return { text: L('Prueba del freno terminada.', 'Brake test ended.') }
  }
  const resetsAt = new Date(Date.now() + 60000).toISOString()
  await update($, test, () => ({ pct: 84, resetsAt }))
  await syncStop($)
  return { text: L('Prueba del freno activa solo en esta sesión: simula 84 % con reinicio en 1 min (reanuda en ~3 min). Pídele a Claude que haga algo para ver el freno.',
    'Brake test active in this session only: simulates 84 % with a reset in 1 min (resumes in ~3 min). Ask Claude to do something to see the brake.') }
}

const cmdUsoSinFreno: Hook<'command.run'> = async ($, e) => {
  if (isAllArg(e.args)) return { text: L('El ∞ se activa de a una sesión.', '∞ is turned on one session at a time.') }
  const t = (await targets($, e.args))[0]
  if (!t) return { text: L('No encontré esa sesión. Usa el n° del desglose o nada para esta sesión.', 'Session not found. Use the number from the list or nothing for this session.') }
  await update($, armed, () => t.id)
  await toggleBypass($, t.id)
  return { text: L('Listo. Revisa el aviso para ver el resultado.', 'Done. Check the notice to see the result.') }
}

const cmdUsoConfig: Hook<'command.run'> = async $ => {
  await update($, cfgTab, () => 'ajustes')
  await $.ui.open({ id: HISTORY_PANE, title: paneTitle() })
  return { text: L('Configuración abierta.', 'Settings opened.') }
}

const cmdUsoHistorial: Hook<'command.run'> = async $ => {
  await update($, cfgTab, () => 'historial')
  void refresh($).catch(() => {})
  await $.ui.open({ id: HISTORY_PANE, title: paneTitle() })
  return { text: L('Historial de uso abierto.', 'Usage history opened.') }
}

const cmdUso: Hook<'command.run'> = async $ => {
  const hidden = !(await read($, isMin))
  await update($, isMin, () => hidden)
  return { text: hidden ? L(`Franja de uso oculta. Escribe ${C('uso')} para volver a mostrarla.`, `Usage band hidden. Type ${C('uso')} to show it again.`) : L('Franja de uso visible.', 'Usage band visible.') }
}

// Etiqueta de una sesión detenida y su color.
function stopLabel(s: { stop?: string; until?: string }): { text: string; color: string } | null {
  const at = s.until ? hhmm(s.until) : ''
  if (s.stop === 'semanal') return { text: L(`Frenada: llegó a su tope semanal · reanuda sola el ${s.until ? dayHour(s.until) : ''}`, `Braked: reached its weekly cap · resumes on its own on ${s.until ? dayHour(s.until) : ''}`), color: '#ef4444' }
  if (s.stop === 'pausa') return { text: L('Pausada por ti', 'Paused by you'), color: '#facc15' }
  if (s.stop === 'tope') return { text: L(`Frenada: llegó a su tope de 5 h · reanuda sola a las ${at}`, `Braked: reached its 5-hour cap · resumes on its own at ${at}`), color: '#ef4444' }
  if (s.stop === 'limite') return { text: L(`Frenada: el bloque de 5 h llegó al ${100 - CFG.closeMargin} %, cerca del límite real · reanuda sola a las ${at}`, `Braked: the 5-hour block reached ${100 - CFG.closeMargin} %, close to the real limit · resumes on its own at ${at}`), color: '#ef4444' }
  if (s.stop === 'freno') return { text: L(`Frenada: el bloque de 5 h llegó al ${CFG.brakeAt} % · reanuda sola a las ${at}`, `Braked: the 5-hour block reached ${CFG.brakeAt} % · resumes on its own at ${at}`), color: '#ef4444' }
  return null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Primero la configuración: las descripciones salen en el idioma elegido.
    await loadCfg($)
    // Aviso de responsabilidad: una sola vez por persona, sin bloquear nada.
    if (!(await $.store.get(DISCLAIMER_KEY))) {
      await $.store.set(DISCLAIMER_KEY, true)
      $.ui.toast(L('Usar este mod implica aceptar su aviso de responsabilidad (README).', 'Using this mod means you accept its disclaimer (README).'))
    }
    const anyHint = L('[n° | todas]', '[n | all]')
    const defs: { name: CmdName; description: string; argumentHint?: string }[] = [
      { name: 'uso', description: L('Muestra u oculta la franja de uso por sesión', 'Show or hide the per-session usage band') },
      { name: 'uso-continuar', description: L('Libera freno y tope de esta sesión, la n° del desglose o todas, hasta el reinicio', 'Release brake and cap for this session, number n in the list, or all, until the reset'), argumentHint: anyHint },
      { name: 'uso-prueba-freno', description: L('Simula el freno en esta sesión (repite para terminar la prueba)', 'Simulate the brake in this session (run again to end the test)') },
      { name: 'uso-config', description: L('Abre la configuración: ajustes, historial y ayuda', 'Open the settings: settings, history and help') },
      { name: 'uso-sin-freno', description: L('Activa o quita el ∞ (ignorar freno global) de esta sesión o la n° del desglose', 'Toggle ∞ (ignore global brake) for this session or number n in the list'), argumentHint: L('[n°]', '[n]') },
      { name: 'uso-historial', description: L('Abre el historial de bloques de 5 h en un panel aparte', 'Open the 5-hour block history in a separate pane') },
      { name: 'uso-limite', description: L('Tope de esta sesión en % del bloque de 5 h', "This session's cap as % of the 5-hour block"), argumentHint: L('<n> | quitar', '<n> | remove') },
      { name: 'uso-pausar', description: L('Pausa esta sesión, la n° del desglose o todas', 'Pause this session, number n in the list, or all'), argumentHint: anyHint },
      { name: 'uso-programar', description: L('Programa un prompt en esta sesión o la n°: próximo bloque, semana o una hora', 'Schedule a prompt in this session or number n: next block, week or a time'), argumentHint: L('[n°] <bloque | semana | 07:30> <texto>', '[n] <block | week | 07:30> <text>') },
      { name: 'uso-programados', description: L('Muestra la cola de prompts programados, numerada', 'Show the numbered queue of scheduled prompts'), argumentHint: L('[n°]', '[n]') },
      { name: 'uso-cancelar', description: L('Cancela el prompt programado n° de esta sesión, o todos', 'Cancel scheduled prompt n in this session, or all'), argumentHint: L('<n°> | todos', '<n> | all') },
      { name: 'uso-seguimiento', description: L('Agrega un seguimiento al prompt programado n°', 'Add a follow-up to scheduled prompt n'), argumentHint: L('<n°> <texto>', '<n> <text>') },
      { name: 'uso-reanudar', description: L('Reanuda esta sesión, la n° del desglose o todas', 'Resume this session, number n in the list, or all'), argumentHint: anyHint },
    ]
    for (const d of defs) {
      await $.command.register(d)
      await $.command.register({ ...d, name: EN_CMD[d.name] })
    }
    await update($, nowMs, () => Date.now())
    await markAlive($, true).catch(() => {})
    await update($, busyAt, () => 0)
    void schedFire($).catch(() => false)
    $.clock.every(60000, async () => {
      await loadCfg($)
      await markAlive($, true).catch(() => {})
      await update($, nowMs, () => Date.now())
      await refresh($).catch(() => {})
      if (!(await schedFire($).catch(() => false))) await maybeResume($).catch(() => {})
    })
    refresh($).catch(err => update($, status, () => `Error: ${String(err).slice(0, 120)}`).catch(() => {}))
    return result
  })

  on('session.end', async ($, e, next) => {
    await markAlive($, false).catch(() => {})
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await syncStop($)
    if (!r) return next(e)
    await update($, stoppedBy, () => r.kind)
    return {
      deny: `${r.text} ${L('No uses más herramientas ni empieces nada nuevo. Responde ahora en 2 o 3 líneas: dónde quedaste y cuál es el siguiente paso.', 'Do not use any more tools or start anything new. Reply now in 2 or 3 lines: where you left off and what the next step is.')}`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'plugin') return next(e)
    const r = await syncStop($)
    return r ? { drop: r.text } : next(e)
  })

  on('command.run', { command: 'uso-continuar' }, cmdUsoContinuar)
  on('command.run', { command: 'session-continue' }, cmdUsoContinuar)

  on('command.run', { command: 'uso-limite' }, cmdUsoLimite)
  on('command.run', { command: 'session-limit' }, cmdUsoLimite)

  on('command.run', { command: 'uso-pausar' }, cmdUsoPausar)
  on('command.run', { command: 'session-pause' }, cmdUsoPausar)

  on('command.run', { command: 'uso-reanudar' }, cmdUsoReanudar)
  on('command.run', { command: 'session-resume' }, cmdUsoReanudar)

  on('command.run', { command: 'uso-prueba-freno' }, cmdUsoPruebaFreno)
  on('command.run', { command: 'session-brake-test' }, cmdUsoPruebaFreno)

  on('command.run', { command: 'uso-sin-freno' }, cmdUsoSinFreno)
  on('command.run', { command: 'session-no-brake' }, cmdUsoSinFreno)

  on('command.run', { command: 'uso-programar' }, cmdUsoProgramar)
  on('command.run', { command: 'session-schedule' }, cmdUsoProgramar)
  on('command.run', { command: 'uso-programados' }, cmdUsoProgramados)
  on('command.run', { command: 'session-scheduled' }, cmdUsoProgramados)
  on('command.run', { command: 'uso-cancelar' }, cmdUsoCancelar)
  on('command.run', { command: 'session-unschedule' }, cmdUsoCancelar)
  on('command.run', { command: 'uso-seguimiento' }, cmdUsoSeguimiento)
  on('command.run', { command: 'session-follow-up' }, cmdUsoSeguimiento)

  on('command.run', { command: 'uso-config' }, cmdUsoConfig)
  on('command.run', { command: 'session-config' }, cmdUsoConfig)

  on('command.run', { command: 'uso-historial' }, cmdUsoHistorial)
  on('command.run', { command: 'session-history' }, cmdUsoHistorial)

  on('ui.render', { component: 'Pane', requestId: HISTORY_PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const tab = await read($, cfgTab)
    const tabs = (
      <Box flexDirection="row" gap="sm">
        {[['sesiones', L('Sesiones', 'Sessions')], ['ajustes', L('⚙ Ajustes', '⚙ Settings')], ['historial', L('Historial', 'History')], ['ayuda', L('Comandos', 'Commands')]].map(([id, label]) => (
          <Button key={`tab-${id}`} label={label!} variant={tab === id ? 'primary' : 'secondary'} onPress={() => void update($, cfgTab, () => id!).then(() => (id === 'sesiones' || id === 'historial' ? refresh($).catch(() => {}) : undefined))} />
        ))}
      </Box>
    )
    if (tab === 'sesiones') {
      await read($, schedRev)
      const sched = await schedList($)
      const sUi = await read($, schedUi)
      const sDraft = await read($, schedDraft)
      const sErr = await read($, schedErr)
      const Input = 'Input' in els ? els.Input : undefined
      const snapS = await read($, snapshot)
      const composer = (sid: string, depth: number) => {
        if (!sUi || sUi.sid !== sid) return null
        const follow = sUi.mode === 'follow' || (sUi.mode === 'edit' && !!sched.find(i => i.id === sUi.id)?.after)
        const nextAt = snapS?.resetsAt ? hhmm(new Date(Date.parse(snapS.resetsAt) + resumeMargin()).toISOString()) : L('ahora', 'now')
        const weekAt = snapS?.weeklyResetsAt ? dayHour(new Date(Date.parse(snapS.weeklyResetsAt) + resumeMargin()).toISOString()) : '—'
        const pick = (type: SchedDraft['type']) => () => void update($, schedDraft, d => ({ ...d, ...schedTyped, type }))
        return (
          <Box key={`sc-${sid}`} flexDirection="column" gap="xs" paddingLeft={depth * 2}>
            <Text size="caption" dimColor>{sUi.mode === 'edit' ? L('Editar prompt', 'Edit prompt') : follow ? L('Seguimiento: sale cuando Claude termine de responder el anterior', 'Follow-up: sent when Claude finishes answering the previous one') : L('Nuevo prompt programado', 'New scheduled prompt')}</Text>
            {Input && <Input key={`si-${sid}`} rows={3} autoFocus placeholder={L('Revisa los resultados y arma el informe con las 3 figuras', 'Review the results and write the report with the 3 figures')} value={sDraft.text} onInput={v => { schedTyped.text = v }} onSubmit={v => { schedTyped.text = v; void schedSubmit($) }} submitLabel="↵" />}
            {!follow && (
              <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap="sm">
                <Button key={`st-next-${sid}`} label={L(`↻ Próximo bloque · ${nextAt}`, `↻ Next block · ${nextAt}`)} variant={sDraft.type === 'next' ? 'primary' : 'secondary'} onPress={pick('next')} />
                <Button key={`st-week-${sid}`} label={L(`Semanal · ${weekAt}`, `Weekly · ${weekAt}`)} variant={sDraft.type === 'week' ? 'primary' : 'secondary'} onPress={pick('week')} />
                <Button key={`st-time-${sid}`} label={L('Hora', 'Time')} variant={sDraft.type === 'time' ? 'primary' : 'secondary'} onPress={pick('time')} />
                {sDraft.type === 'time' && Input && <Input key={`sh-${sid}`} placeholder="07:30" value={sDraft.time} onInput={v => { schedTyped.time = v }} onSubmit={v => { schedTyped.time = v; void schedSubmit($) }} />}
              </Box>
            )}
            <Box flexDirection="row" alignItems="center" gap="sm">
              <Box flexGrow={1} />
              <Button key={`sx-${sid}`} label={L('Cancelar', 'Cancel')} onPress={() => { schedTyped = {}; void update($, schedUi, () => null) }} />
              <Button key={`ss-${sid}`} label={sUi.mode === 'edit' ? L('Guardar', 'Save') : L('Programar', 'Schedule')} variant="primary" onPress={() => void schedSubmit($)} />
            </Box>
            {sErr && <Text size="caption" color="#ef4444">{sErr}</Text>}
          </Box>
        )
      }
      const queue = (sid: string) => {
        const list = schedOrdered(sched, sid)
        return (
          <Box key={`sq-${sid}`} flexDirection="column" gap="xs">
            {sUi?.mode === 'new' && composer(sid, 0)}
            {list.map(({ item, depth }) => (
              sUi?.mode === 'edit' && sUi.id === item.id
                ? composer(sid, depth)
                : <Box key={`sw-${item.id}`} flexDirection="column" gap="xs">
                    {(() => {
                      const btns = [
                        <Button key={`pe-${item.id}`} label="✎" onPress={() => void schedOpen($, { mode: 'edit', sid, id: item.id })} />,
                        <Button key={`pf-${item.id}`} label="+" onPress={() => void schedOpen($, { mode: 'follow', sid, id: item.id })} />,
                        <Button key={`px-${item.id}`} label="✕" onPress={() => void schedDelete($, item.id)} />,
                      ]
                      const label = <Text size="caption" color={SCHED_COLOR} wrap="truncate">{item.after ? '↳' : '⏱'} {schedLabel(item)}</Text>
                      const text = <Text size="caption" wrap="truncate">{item.text}</Text>
                      return (e.props.bodyColumns ?? 60) >= 90
                        ? <Box flexDirection="row" alignItems="center" gap="sm" paddingLeft={depth * 2}>
                            {label}
                            <Box flexGrow={1} flexShrink={1}>{text}</Box>
                            {btns}
                          </Box>
                        : <Box flexDirection="column" gap="xs" paddingLeft={depth * 2}>
                            <Box flexDirection="row" alignItems="center" gap="sm">
                              <Box flexGrow={1} flexShrink={1}>{label}</Box>
                              {btns}
                            </Box>
                            {text}
                          </Box>
                    })()}
                    {sUi?.mode === 'follow' && sUi.id === item.id && composer(sid, depth + 1)}
                  </Box>
            ))}
          </Box>
        )
      }
      const schedCount = (sid: string) => sched.filter(i => i.sid === sid).length
      const snap = await read($, snapshot)
      const view = await read($, capView)
      const Select = 'Select' in els ? els.Select : undefined
      const viewPick = Select
        ? <Select key="capview" label={L('Límites', 'Limits')} options={[{ value: 'bloque', label: L('Bloque de 5 h', '5-hour block') }, { value: 'semana', label: L('Semanal', 'Weekly') }]} value={view} onSelect={v => void update($, capView, () => v)} />
        : null
      const me = await $.session.id()
      const Svg = 'Svg' in els ? els.Svg : undefined
      if (!snap) return <Box flexDirection="column" gap="sm">{tabs}<Text dimColor>{L('Calculando uso…', 'Calculating usage…')}</Text></Box>
      const scale = Math.max(snap.fiveHour || 1, ...snap.sessions.map(s => s.cap ?? 0))
      const full = snap.sessions.filter(s => s.bypass).length >= CFG.maxBypass
      const barW = Math.max(50, Math.min(140, (e.props.bodyColumns ?? 60) * 8 - 330))
      if (view === 'semana') {
        const list = snap.week ?? snap.sessions
        const wscale = Math.max(snap.weekly || 1, ...list.map(s => ((s.wcap ?? 100) < 100 ? s.wcap! : 0)))
        return (
          <Box flexDirection="column" gap="sm">
            {tabs}
            {viewPick}
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap="sm" minHeight={2}>
              <Text size="caption" dimColor>{L(`Semanal: ${fmt(snap.weekly ?? 0)} % usado · se reinicia el ${snap.weeklyResetsAt ? dayHour(snap.weeklyResetsAt) : '—'}`, `Weekly: ${fmt(snap.weekly ?? 0)} % used · resets ${snap.weeklyResetsAt ? dayHour(snap.weeklyResetsAt) : '—'}`)}</Text>
              <Box flexGrow={1} />
              <Button key="reload" label="↻" onPress={() => void refresh($).catch(() => {})} />
            </Box>
            <Text size="caption" dimColor>{L('Tope semanal de cada sesión, en % del límite semanal. 100 % = sin tope.', "Each session's weekly cap, as % of the weekly limit. 100 % = no cap.")}</Text>
            {list.map((s, i) => {
              const wc = s.wcap ?? 100
              const tag = s.stop === 'semanal' ? stopLabel(s) : null
              return (
                <Box key={`w-${s.id}`} flexDirection="column" gap="xs">
                  <Text size="caption" weight={s.id === me ? 'medium' : 'regular'} dimColor={s.id !== me} wrap="truncate">{i + 1}. {s.title}</Text>
                  <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                    {Svg && <Svg source={svgBar(barW, ((s.wpct ?? 0) / wscale) * 100, 0, s.id === me ? '#a855f7' : '#7d7b74', wc < 100 ? (wc / wscale) * 100 : undefined)} alt={`${fmt(s.wpct ?? 0)} %`} width={barW} height={6} />}
                    <Box flexShrink={0}><Text size="caption" tabular wrap="truncate" dimColor={s.id !== me} color={wc < 100 && (s.wpct ?? 0) >= wc ? '#ef4444' : undefined}>
                      {fmt(s.wpct ?? 0)} % / {wc < 100 ? `${fmt(wc)} %` : L('sin tope', 'no cap')}
                    </Text></Box>
                    <Box flexGrow={1} />
                    <Button key={`wdn-${s.id}`} label="−" onPress={() => void stepWeekCap($, s.id, -1)} />
                    <Button key={`wup-${s.id}`} label="+" onPress={() => void stepWeekCap($, s.id, 1)} />
                    {tag && <Button key={`wpp-${s.id}`} label={L('▶ Reanudar', '▶ Resume')} variant="primary" onPress={() => void releaseSession($, s.id)} />}
                  </Box>
                  {tag && <Text size="caption" color={tag.color} wrap="truncate">{tag.text}</Text>}
                </Box>
              )
            })}
          </Box>
        )
      }
      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          {viewPick}
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap="sm" minHeight={2}>
            <Text size="caption" dimColor>{L(`Bloque de 5 h: ${fmt(snap.fiveHour)} % usado · se reinicia a las ${hhmm(snap.resetsAt)}`, `5-hour block: ${fmt(snap.fiveHour)} % used · resets at ${hhmm(snap.resetsAt)}`)}</Text>
            <Box flexGrow={1} />
            <Button key="reload" label="↻" onPress={() => void refresh($).catch(() => {})} />
            <Button key="pause-all" label={L('⏸ Pausar todas', '⏸ Pause all')} onPress={() => void setAll($, true)} />
            <Button key="resume-all" label={L('▶ Reanudar todas', '▶ Resume all')} onPress={() => void setAll($, false)} />
          </Box>
          <Text size="caption" dimColor>{L('✉ programa un prompt en esa sesión para el próximo bloque, el reinicio semanal o una hora. Mientras haya prompts programados, el computador no se suspende; si igual despierta tarde, lo pendiente sale apenas vuelve.', '✉ schedules a prompt in that session for the next block, the weekly reset or a time. While prompts are scheduled the computer stays awake; if it still wakes late, what is pending goes out as soon as it is back.')}</Text>
          {snap.sessions.map((s, i) => {
            const atMax = s.cap === undefined || s.cap >= 100
            const tag = stopLabel(s)
            return (
              <Box key={s.id} flexDirection="column" gap="xs">
                <Box flexDirection="row" gap="sm">
                  <Text size="caption" weight={s.id === me || s.bypass ? 'medium' : 'regular'} dimColor={s.id !== me && !s.bypass} color={s.bypass ? CLAY : undefined} wrap="truncate">
                    {i + 1}. {s.bypass ? '∞ ' : ''}{s.title}
                  </Text>
                </Box>
                <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                  {Svg && <Svg source={svgBar(barW, (s.pct / scale) * 100, 0, s.id === me && !s.paused ? '#3b82f6' : '#7d7b74', s.cap === undefined ? undefined : (s.cap / scale) * 100)} alt={`${fmt(s.pct)} %`} width={barW} height={6} />}
                  <Box flexShrink={0}><Text size="caption" tabular wrap="truncate" dimColor={s.id !== me} color={s.cap !== undefined && s.pct >= s.cap ? '#ef4444' : undefined}>
                    {fmt(s.pct)} %{s.bypass ? ' / ∞' : s.cap !== undefined ? ` / ${fmt(s.cap)} %` : ''}
                  </Text></Box>
                  <Box flexGrow={1} />
                  <Button key={`pdn-${s.id}`} label="−" onPress={() => void (s.bypass ? toggleBypass($, s.id) : stepCap($, s.id, -1))} />
                  {atMax && CFG.maxBypass > 0 && !s.bypass && full
                    ? <Box key={`pup-${s.id}`}><Text dimColor>  ∞  </Text></Box>
                    : atMax && CFG.maxBypass > 0
                    ? <Button key={`pup-${s.id}`} label={s.bypass ? L('∞ activo', '∞ on') : '∞'} variant={s.bypass ? 'primary' : undefined} onPress={() => void (s.bypass ? undefined : toggleBypass($, s.id))} />
                    : <Button key={`pup-${s.id}`} label="+" onPress={() => void stepCap($, s.id, 1)} />}
                  {s.stop
                    ? <Button key={`pp-${s.id}`} label={L('▶ Reanudar', '▶ Resume')} variant="primary" onPress={() => void releaseSession($, s.id)} />
                    : <Button key={`pp-${s.id}`} label="⏸" onPress={() => void setPaused($, s.id, true)} />}
                  <Button key={`pn-${s.id}`} label={schedCount(s.id) ? `✉ ${schedCount(s.id)}` : '✉ +'} variant={sUi?.mode === 'new' && sUi.sid === s.id ? 'primary' : 'secondary'} onPress={() => void schedOpen($, { mode: 'new', sid: s.id })} />
                </Box>
                {tag && <Text size="caption" color={tag.color} wrap="truncate">{tag.text}</Text>}
                {queue(s.id)}
              </Box>
            )
          })}
        </Box>
      )
    }
    if (tab === 'ajustes') {
      const cfg = await loadCfg($)
      const set = async (k: keyof Cfg, v: number | Lang) => {
        await $.store.set(CFG_KEY, { ...(await loadCfg($)), [k]: v })
        await loadCfg($)
        await refresh($).catch(() => {})
        await syncStop($)
        await update($, cfgTab, () => 'ajustes')
      }
      // Hora del día en medias horas (23.5 = 23:30).
      const clock = (v: number) => `${String(Math.floor(v)).padStart(2, '0')}:${v % 1 ? '30' : '00'}`
      const rows: { k: NumKey; label: string; hint: string; step: number; min: number; max: number; wrap?: boolean; show: (v: number) => string }[] = [
        { k: 'brakeAt', label: L('Freno global', 'Global brake'), hint: L('Al llegar a este % del bloque de 5 h se frenan todas las sesiones. Lo que queda sobre el freno es el margen para cerrar ordenado.', 'When the 5-hour block reaches this %, all sessions are braked. What is left above the brake is the margin to wrap up cleanly.'), step: 1, min: 50, max: 99, show: v => `${v} %` },
        { k: 'closeMargin', label: L('Margen de cierre', 'Wrap-up margin'), hint: L('Cuánto antes del tope de una sesión (o del 100 % en una sesión ∞) empieza el cierre ordenado.', "How far before a session's cap (or 100 % for an ∞ session) the clean wrap-up starts."), step: 1, min: 0, max: 10, show: v => `${v} %` },
        { k: 'marginMin', label: L('Reanudar tras el reinicio', 'Resume after reset'), hint: L('Minutos de espera después del reinicio antes de retomar las sesiones frenadas.', 'Minutes to wait after the reset before braked sessions pick up again.'), step: 1, min: 0, max: 30, show: v => `${v} min` },
        { k: 'defaultCap', label: L('Tope por defecto', 'Default cap'), hint: L('Tope con que parte toda sesión que no tenga uno propio. 0 = sin tope.', "Cap every session starts with when it has none of its own. 0 = no cap."), step: 5, min: 0, max: 100, show: v => (v ? `${v} %` : L('sin tope', 'no cap')) },
        { k: 'capStep', label: L('Paso de − / +', '− / + step'), hint: L('Cuánto sube o baja el tope de una sesión con cada toque de − / +.', "How much each − / + press raises or lowers a session's cap."), step: 1, min: 1, max: 50, show: v => `${v} %` },
        { k: 'maxBypass', label: L('Sesiones sin freno (∞)', 'Sessions without brake (∞)'), hint: L('Cuántas sesiones pueden ignorar el freno global a la vez. 0 = función desactivada.', 'How many sessions can ignore the global brake at once. 0 = feature off.'), step: 1, min: 0, max: 3, show: v => (v ? String(v) : L('desactivado', 'off')) },
        { k: 'sleepStart', label: L('Dormir desde', 'Sleep from'), hint: L('Inicio del horario de sueño (hora local).', "Start of sleep hours (local time)."), step: 0.5, min: 0, max: 23.5, wrap: true, show: clock },
        { k: 'sleepEnd', label: L('Dormir hasta', 'Sleep until'), hint: L('Fin del horario de sueño (hora local).', 'End of sleep hours (local time).'), step: 0.5, min: 0, max: 23.5, wrap: true, show: clock },
        { k: 'warnPct', label: L('Aviso del tope', 'Cap warning'), hint: L('Avisa cuando una sesión llega a este % de su tope.', 'Warns when a session reaches this % of its cap.'), step: 5, min: 50, max: 100, show: v => L(`${v} % del tope`, `${v} % of cap`) },
      ]
      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
            <Text weight="medium">Idioma / Language</Text>
            <Box flexGrow={1} />
            <Button key="lang-es" label="Español" variant={cfg.lang === 'es' ? 'primary' : 'secondary'} onPress={() => void set('lang', 'es')} />
            <Button key="lang-en" label="English" variant={cfg.lang === 'en' ? 'primary' : 'secondary'} onPress={() => void set('lang', 'en')} />
          </Box>
          {(() => {
            const row = (r: (typeof rows)[number]) => (
            <Box key={r.k} flexDirection="column">
              <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                <Text weight="medium">{r.label}</Text>
                <Box flexGrow={1} />
                <Button key={`${r.k}-dn`} label="−" onPress={() => void set(r.k, r.wrap ? (cfg[r.k] - r.step + 24) % 24 : Math.max(r.min, cfg[r.k] - r.step))} />
                <Text tabular>{r.show(cfg[r.k])}</Text>
                <Button key={`${r.k}-up`} label="+" onPress={() => void set(r.k, r.wrap ? (cfg[r.k] + r.step) % 24 : Math.min(r.max, cfg[r.k] + r.step))} />
              </Box>
              <Text size="caption" dimColor>{r.hint}{cfg[r.k] === DEFAULTS[r.k] ? '' : L(` Por defecto: ${r.show(DEFAULTS[r.k])}.`, ` Default: ${r.show(DEFAULTS[r.k])}.`)}</Text>
            </Box>
            )
            const isSleep = (k: NumKey) => k === 'sleepStart' || k === 'sleepEnd'
            const rule = <Text dimColor wrap="truncate">{'─'.repeat(Math.max(20, Math.min(120, (e.props.bodyColumns ?? 60) - 4)))}</Text>
            return (
              <Box flexDirection="column" gap="sm">
                <Text weight="semibold">{L('Freno y topes', 'Brake and caps')}</Text>
                {rows.filter(r => !isSleep(r.k)).map(row)}
                {rule}
                <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                  <Text weight="semibold">☾ {L('Horario de sueño', 'Sleep hours')}</Text>
                  <Box flexGrow={1} />
                  <Button key="sleep-on" label={cfg.sleepOn ? L('Activado', 'On') : L('Desactivado', 'Off')} variant={cfg.sleepOn ? 'primary' : 'secondary'} onPress={() => void set('sleepOn', cfg.sleepOn ? 0 : 1)} />
                </Box>
                <Text size="caption" dimColor>{L('Si el bloque de 5 h se reinicia dentro de este horario, no se aplican el freno global ni los topes de 5 h: las sesiones siguen mientras duermes y se detienen recién en 100 % menos el margen de cierre, antes del corte de Anthropic. Los topes semanales siguen aplicando. En la franja lo indica una luna ☾.', "If the 5-hour block resets within these hours, the global brake and 5-hour caps don't apply: sessions keep going while you sleep and only stop at 100 % minus the close margin, before Anthropic's cutoff. Weekly caps still apply. A moon ☾ on the band shows it.")}</Text>
                {cfg.sleepOn ? rows.filter(r => isSleep(r.k)).map(row) : null}
                {rule}
              </Box>
            )
          })()}
          <Box flexDirection="row" gap="sm">
            <Button key="cfg-reset" label={L('Restaurar valores por defecto', 'Restore defaults')} onPress={() => void $.store.set(CFG_KEY, { ...DEFAULTS, lang: CFG.lang }).then(() => set('brakeAt', DEFAULTS.brakeAt))} />
          </Box>
          <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
            <Text weight="medium">{L('Franja sobre el chat', 'Band above the chat')}</Text>
            <Box flexGrow={1} />
            <Button key="hide-band" label={L('Ocultar franja', 'Hide band')} onPress={() => void update($, isMin, () => true).then(() => $.ui.toast(L(`Franja oculta. Escribe ${C('uso')} para volver a mostrarla.`, `Band hidden. Type ${C('uso')} to show it again.`)))} />
          </Box>
          <Text size="caption" dimColor>{L(`Para volver a mostrarla, escribe ${C('uso')}.`, `To show it again, type ${C('uso')}.`)}</Text>
          <Text size="caption" dimColor>{L('Los ajustes valen para todas tus sesiones y llegan a las demás en menos de un minuto.', 'Settings apply to all your sessions and reach the others in under a minute.')}</Text>
        </Box>
      )
    }
    if (tab === 'ayuda') {
      const any = L('[n° | todas]', '[n | all]')
      const sections: { title: string; items: [string, string][] }[] = [
        { title: L('Panel y franja', 'Pane and band'), items: [
          [C('uso-config'), L('Abre este panel.', 'Opens this pane.')],
          [C('uso-historial'), L('Abre el panel en el historial.', 'Opens the pane on the history.')],
          [C('uso'), L('Oculta o muestra la franja (también: Ajustes → Ocultar franja).', 'Hides or shows the band (also: Settings → Hide band).')],
        ] },
        { title: L('Pausar y reanudar', 'Pause and resume'), items: [
          [`${C('uso-pausar')} ${any}`, L('Pausa esta sesión, la n° del desglose o todas.', 'Pauses this session, number n in the list, or all.')],
          [`${C('uso-reanudar')} ${any}`, L('Reanuda; las que trabajaban retoman solas.', 'Resumes; those that were working pick up on their own.')],
        ] },
        { title: L('Topes', 'Caps'), items: [
          [`${C('uso-limite')} 30`, L('Tope de esta sesión en % del bloque de 5 h.', "This session's cap as % of the 5-hour block.")],
          [C('uso-limite'), L('Muestra el tope actual de esta sesión.', "Shows this session's current cap.")],
          [`${C('uso-limite')} ${L('quitar', 'remove')}`, L('Quita el tope de esta sesión.', "Removes this session's cap.")],
          [`${C('uso-limite')} ${L('semanal', 'weekly')} 20`, L('Tope semanal de esta sesión en % del límite semanal (quitar: sin tope).', "This session's weekly cap as % of the weekly limit (remove: no cap).")],
        ] },
        { title: L('Freno', 'Brake'), items: [
          [`${C('uso-continuar')} ${any}`, L('Libera freno y tope hasta el reinicio (sin nada: esta sesión).', 'Releases brake and cap until the reset (no argument: this session).')],
          [`${C('uso-sin-freno')} ${L('[n°]', '[n]')}`, L('Activa o quita el ∞: la sesión ignora el freno global hasta el reinicio (pide confirmar).', 'Toggles ∞: the session ignores the global brake until the reset (asks to confirm).')],
          [C('uso-prueba-freno'), L('Simula el freno en esta sesión; repítelo para terminar.', 'Simulates the brake in this session; run it again to end.')],
        ] },
      ]
      const rule = <Text dimColor wrap="truncate">{'─'.repeat(Math.max(20, Math.min(120, (e.props.bodyColumns ?? 60) - 4)))}</Text>
      const head = (t: string) => <Text weight="semibold">{t}</Text>
      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          <Text size="caption" dimColor>{L('En los comandos con número o texto, presiona Esc antes de Enter para cerrar el menú de sugerencias.', 'For commands with a number or text, press Esc before Enter to close the suggestions menu.')}</Text>
          {sections.map((sec, k) => (
            <Box key={sec.title} flexDirection="column" gap="sm">
              {k > 0 && rule}
              {head(sec.title)}
              {sec.items.map(([cmd, what]) => (
                <Box key={cmd} flexDirection="column">
                  <Text weight="medium" mono>{cmd}</Text>
                  <Text size="caption" dimColor>{what}</Text>
                </Box>
              ))}
            </Box>
          ))}
          {rule}
          {head(L('✉ Prompts programados', '✉ Scheduled prompts'))}
          {([
            [`${C('uso-programar')} ${L('[n°] bloque <texto>', '[n] block <text>')}`, L('Sale al empezar el próximo bloque de 5 h. En vez de bloque: semana (reinicio semanal) o una hora como 07:30. Con n°, en esa sesión del desglose.', 'Goes out when the next 5-hour block starts. Instead of block: week (weekly reset) or a time like 07:30. With n, in that session of the list.')],
            [C('uso-programados'), L('Muestra la cola de esta sesión, numerada.', "Shows this session's queue, numbered.")],
            [`${C('uso-seguimiento')} ${L('<n°> <texto>', '<n> <text>')}`, L('Agrega un seguimiento: sale cuando Claude termine de responder el n°.', 'Adds a follow-up: sent when Claude finishes answering number n.')],
            [`${C('uso-cancelar')} ${L('<n°> | todos', '<n> | all')}`, L('Cancela ese prompt o todos los de esta sesión.', "Cancels that prompt or all of this session's.")],
          ] as [string, string][]).map(([cmd, what]) => (
            <Box key={cmd} flexDirection="column">
              <Text weight="medium" mono>{cmd}</Text>
              <Text size="caption" dimColor>{what}</Text>
            </Box>
          ))}
          <Text size="caption" dimColor>{L('No gastan tokens y funcionan aunque estés sin uso. También con botones: en la pestaña Sesiones, ✉ en la fila de una sesión abre el cuadro para escribir el prompt y elegir cuándo sale (próximo bloque, reinicio semanal o una hora). En la cola: ✎ edita, + agrega un seguimiento que sale cuando Claude termina de responder el anterior, ✕ lo cancela. Nunca salen con la sesión frenada o pausada, y mientras haya alguno el computador no se suspende.', 'They spend no tokens and work even with no usage left. Also with buttons: in the Sessions tab, ✉ on a session row opens the box to write the prompt and pick when it goes out (next block, weekly reset or a time). In the queue: ✎ edits, + adds a follow-up sent when Claude finishes answering the previous one, ✕ cancels it. They never go out while the session is braked or paused, and while any is queued the computer stays awake.')}</Text>
          {rule}
          {head(L('Guía rápida', 'Quick guide'))}
          <Text size="caption" weight="medium">{L('Colores del punto', 'Dot colors')}</Text>
          <Text size="caption" dimColor>{L('Verde holgado · amarillo justo · naranjo te pasas por menos de 1 h · rojo 1–2 h · morado 2–3 h · morado oscuro más. Desde rojo parpadea.', 'Green plenty of room · yellow tight · orange you run out less than 1 h early · red 1–2 h · purple 2–3 h · dark purple more. Blinks from red up.')}</Text>
          <Text size="caption" weight="medium">{L('Desglose', 'Breakdown')}</Text>
          <Text size="caption" dimColor>{L(`− / + cambian el tope de la sesión de a ${CFG.capStep} %; ⏸ / ▶ la pausan o reanudan; ∞ la deja sin freno global (nombre en azul lavanda); ✉ programa un prompt; la raya clara en la barra marca su tope.`, `− / + change the session's cap by ${CFG.capStep} %; ⏸ / ▶ pause or resume it; ∞ exempts it from the global brake (name in lavender blue); ✉ schedules a prompt; the light mark on the bar shows its cap.`)}</Text>
          <Text size="caption" dimColor>{L('Se entrega tal cual, sin garantías; el freno y los topes pueden cortar tareas a la mitad. Ver "Disclaimer" en el README.', 'Provided as is, without warranty; the brake and caps can stop tasks midway. See "Disclaimer" in the README.')}</Text>
        </Box>
      )
    }
    const Svg = 'Svg' in els ? els.Svg : undefined
    const Select = 'Select' in els ? els.Select : undefined
    const raw = await $.store.get(HISTORY_KEY)
    const all = Array.isArray(raw) ? (raw as HistoryBlock[]) : []
    const range = await read($, histRange)
    const perSession = range === 'semana' || range === 'mes'
    const whoPick = perSession ? await read($, histSession) : ''
    const titles = [...new Set(all.filter(b => Date.now() - Date.parse(b.resetsAt) < 31 * 86400e3).flatMap(b => b.top.map(t => t.title)))]
    // Una sesión elegida que ya no aparece en el último mes vuelve a "Todas".
    const who = titles.includes(whoPick) ? whoPick : ''
    const groupPick = await read($, histGroup)
    const group = groupPick || (range === 'semana' ? 'bloque' : 'dia')
    const { buckets, unit } = bucketize(all, range, who, group)
    const byBlock = perSession && group === 'bloque'
    const width = Math.max(260, Math.min(900, (e.props.bodyColumns ?? 60) * 8))
    const snapNow = await read($, snapshot)
    const curReset = snapNow?.weeklyResetsAt ? Date.parse(snapNow.weeklyResetsAt) : 0
    // Semanas con datos guardados: la actual siempre; las anteriores si tienen algún bloque.
    const weekOpts: { value: string; label: string }[] = []
    if (curReset) {
      const oldest = all.length ? Math.min(...all.map(b => Date.parse(b.resetsAt))) : curReset
      for (let k = 0; k < 52; k++) {
        const end = curReset - k * SEVEN_DAYS
        if (k > 0 && end <= oldest) break
        const startIso = new Date(end - SEVEN_DAYS).toISOString(), endIso = new Date(end).toISOString()
        weekOpts.push({ value: String(k), label: k === 0 ? L(`Esta semana (hasta ${dayHour(endIso)})`, `This week (until ${dayHour(endIso)})`) : L(`${shortDay(startIso)} – ${shortDay(endIso)}`, `${shortDay(startIso)} – ${shortDay(endIso)}`) })
      }
    }
    const wk = Math.min(await read($, histWeek), Math.max(0, weekOpts.length - 1))
    const storedCosts = await $.store.get(WEEK_COSTS_KEY)
    // El almacén manda: la copia en memoria solo adelanta un cálculo recién terminado.
    const costs = { ...(await read($, weekCosts)), ...(storedCosts && typeof storedCosts === 'object' ? (storedCosts as Record<string, number>) : {}) }
    const wkEnd = curReset ? new Date(curReset - wk * SEVEN_DAYS).toISOString() : ''
    // Una semana pasada sin costo guardado se calcula en segundo plano (una vez por semana elegida).
    if (wk > 0 && costs[wkEnd] === undefined && !COSTING.has(wkEnd)) {
      COSTING.add(wkEnd)
      void loadWeekCost($, wkEnd).catch(() => {}).finally(() => COSTING.delete(wkEnd))
    }
    const weekly = curReset
      ? { ...weeklyChart(all.slice().reverse(), width, wkEnd, wk ? Date.parse(wkEnd) : Date.now(), wk ? null : snapNow!.weekly, wk > 0), end: wkEnd }
      : null
    const ranges = [
      { value: 'semana', label: L('Última semana', 'Last week') },
      { value: 'mes', label: L('Último mes', 'Last month') },
      { value: 'año', label: L('Último año', 'Last year') },
      { value: 'todo', label: L('Histórico', 'All time') },
    ]
    return (
      <Box flexDirection="column" gap="sm">
        {tabs}
        <Box flexDirection={(e.props.bodyColumns ?? 60) >= 110 ? "row" : "column"} flexWrap="wrap" gap="sm" alignItems={(e.props.bodyColumns ?? 60) >= 110 ? "center" : "flex-start"}>
          {Select && <Select key="range" label={L('Periodo', 'Period')} options={ranges} value={range} onSelect={v => void update($, histRange, () => v)} />}
          {Select && perSession && (
            <Select key="who" label={L('Sesión', 'Session')} options={[{ value: '', label: L('Todas', 'All') }, ...titles.map(t => ({ value: t, label: t.length > 30 ? `${t.slice(0, 29)}…` : t }))]}
              value={who} onSelect={v => void update($, histSession, () => v)} />
          )}
          {Select && perSession && (
            <Select key="group" label={L('Agrupar', 'Group')} options={[{ value: 'bloque', label: L('Por ventana de 5 h', 'By 5-hour window') }, { value: 'dia', label: L('Por día', 'By day') }]}
              value={group} onSelect={v => void update($, histGroup, () => v)} />
          )}
        </Box>
        {!perSession && <Text size="caption" dimColor>{L('El detalle por sesión está disponible hasta el último mes.', 'Per-session detail is available up to the last month.')}</Text>}
        {buckets.length === 0 || !Svg ? (
          <Text dimColor>{L('Aún no hay bloques guardados en este periodo. El historial se llena desde que el mod quedó instalado.', 'No blocks saved in this period yet. The history fills up from when the mod was installed.')}</Text>
        ) : (
          <Box flexDirection="column" gap="sm">
            <Text size="caption" weight="medium">{unit}</Text>
            <Svg source={historyChart(buckets, width, byBlock)} alt={L('Uso en el periodo', 'Usage in the period')} width={width} height={222} isInteractive />
            {byBlock && <Text size="caption" dimColor>{L(`Cada barra es una ventana de 5 h, rotulada con la hora en que se reinició; las líneas punteadas separan los días. Línea roja: freno del ${CFG.brakeAt} %.`, `Each bar is a 5-hour window, labeled with the time it reset; dashed lines separate days. Red line: ${CFG.brakeAt} % brake.`)}</Text>}
            {!byBlock && perSession && <Text size="caption" dimColor>{L('Cada barra suma los % de las ventanas de 5 h de ese día: 150 % equivale a una ventana y media gastada.', "Each bar adds up the % of that day's 5-hour windows: 150 % means one and a half windows used.")}</Text>}
          </Box>
        )}
        {range === 'semana' && weekly && Svg && (
          <Box flexDirection="column" gap="sm">
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap="sm">
              <Text size="caption" weight="medium">{L('Semanal · del inicio al reinicio del periodo', 'Weekly · from the start to the reset of the period')}</Text>
              {Select && weekOpts.length > 1 && <Select key="week" label={L('Semana', 'Week')} options={weekOpts} value={String(wk)} onSelect={v => void update($, histWeek, () => Number(v))} />}
            </Box>
            <Svg source={weekly.svg} alt={L('Uso semanal en el tiempo', 'Weekly usage over time')} width={width} height={130} isInteractive />
            <Text size="caption" dimColor>{wk > 0
              ? (weekly.final !== null
                ? L(`Esa semana terminó en ${fmt(weekly.final)} % (último dato guardado antes del reinicio del ${dayHour(weekly.end)}).`, `That week ended at ${fmt(weekly.final)} % (last value saved before the ${dayHour(weekly.end)} reset).`)
                : L('No hay datos guardados de esa semana.', 'No data saved for that week.'))
              : weekly.hit !== null
              ? L(`A este ritmo llegas al 100 % el ${dayName(new Date(weekly.hit).toISOString())} a las ${hhmm(new Date(weekly.hit).toISOString())}, antes del reinicio (${dayName(weekly.end)} ${hhmm(weekly.end)}).`, `At this pace you hit 100 % on ${dayName(new Date(weekly.hit).toISOString())} at ${hhmm(new Date(weekly.hit).toISOString())}, before the reset (${dayName(weekly.end)} ${hhmm(weekly.end)}).`)
              : L(`A este ritmo no llegas al 100 % antes del reinicio (${dayName(weekly.end)} ${hhmm(weekly.end)}).`, `At this pace you won't hit 100 % before the reset (${dayName(weekly.end)} ${hhmm(weekly.end)}).`)}
              {wk === 0 && L(' Línea punteada: proyección lineal; raya gris: ahora.', ' Dashed line: linear projection; gray line: now.')}</Text>
            {wk === 0 && snapNow?.weekly != null && (() => {
              const r = weekPerBlockPct(all, Date.now())
              if (r === null) return <Text size="caption" dimColor>{L('Bloques de 5 horas restantes: aún faltan datos.', '5-hour blocks left: not enough data yet.')}</Text>
              const left = Math.max(0, 100 - snapNow.weekly)
              const blocks = left / (r * 100)
              const n = Math.round(blocks * 10) / 10
              const nTxt = n.toFixed(1).replace('.', CFG.lang === 'en' ? '.' : ',')
              const what = blocks >= 1
                ? L(`${nTxt} ${n === 1 ? 'bloque' : 'bloques'} de 5 horas`, `${nTxt} 5-hour ${n === 1 ? 'block' : 'blocks'}`)
                : L(`el ${fmt(blocks * 100)} % de un bloque de 5 horas`, `${fmt(blocks * 100)} % of a 5-hour block`)
              return <Text size="caption" weight="medium">{L(`Con ${fmt(left)} % semanal restante, alcanza para ${what}.`, `With ${fmt(left)} % of the week left, that's enough for ${what}.`)}</Text>
            })()}
            {(() => {
              const v = wk === 0 ? snapNow?.weekUsd : costs[wkEnd]
              const text = v !== undefined && v < 0
                ? L('Gasto a precios de API: no disponible (no quedan registros de esa semana).', 'Spend at API prices: unavailable (no logs left for that week).')
                : v === undefined
                ? (wk === 0 ? null : L('Gasto a precios de API: calculando… (puede tardar unos segundos)', 'Spend at API prices: calculating… (may take a few seconds)'))
                : wk === 0
                ? L(`Llevas gastado esta semana: ${usd(v)} a precios de API.`, `Spent so far this week: ${usd(v)} at API prices.`)
                : L(`Gasto de esa semana: ${usd(v)} a precios de API.`, `Spent that week: ${usd(v)} at API prices.`)
              return text && <Text size="caption" weight="medium">{text}</Text>
            })()}
            <Text size="caption" dimColor>{L('Estimación con los tokens de tus registros locales y los precios de lista por modelo; no incluye herramientas de servidor ni uso fuera de este computador. Con tu suscripción no pagas esto: sirve para comparar.', "Estimated from the tokens in your local logs and list prices per model; excludes server tools and usage outside this computer. Your subscription doesn't charge this: it's for comparison.")}</Text>
          </Box>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'uso' }, cmdUso)
  on('command.run', { command: 'session-usage' }, cmdUso)

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await update($, busyAt, () => Date.now()).catch(() => {})
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // El fin de un subagente no es el fin del turno: la sesión sigue trabajando.
    if (e.agentId !== undefined) return result
    await update($, busyAt, () => 0).catch(() => {})
    await schedTurnDone($, e.reason).catch(() => {})
    refresh($).catch(err => update($, status, () => `Error: ${String(err).slice(0, 120)}`).catch(() => {}))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey) return next(e)
    if (snap === null) {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{(await read($, status)) || L('Calculando uso…', 'Calculating usage…')}</Text>
    }

    const open = await read($, isOpen)
    const me = await $.session.id()
    const { Box, Button, Text } = $.ui.resolve(e)
    const toggle = () => update($, isOpen, v => !v).then(() => void refresh($).catch(() => {}))
    const total = snap.fiveHour || 1
    const scale = Math.max(total, ...snap.sessions.map(s => s.cap ?? 0))
    const now = await read($, nowMs)
    const braked = await read($, isBraked)
    const resume = await read($, resumeAt)
    await read($, schedRev)
    const mySched = (await schedList($)).some(i => i.sid === me)

    if (await read($, isMin)) {
      return next(e)
    }

    const cols = e.props.bodyColumns ?? 120
    const myBypass = !!snap.sessions.find(s => s.id === me)?.bypass
    const bypassFull = snap.sessions.filter(s => s.bypass).length >= CFG.maxBypass
    const mode = cols >= 95 ? 'wide' : cols >= 65 ? 'mid' : 'narrow'
    const perRow = mode === 'narrow' ? 3 : 2
    // Filas que caben (una detenida usa una línea más); la sesión actual siempre entra, en el último lugar si no es de las que más gastan.
    const budget = (e.props.maxRows ?? 40) - 5
    let fit = 0
    for (let used = 0; fit < snap.sessions.length; fit++) {
      used += perRow + (snap.sessions[fit]!.stop ? 1 : 0)
      if (used > budget) break
    }
    fit = Math.max(1, fit)
    const myIdx = snap.sessions.findIndex(s => s.id === me)
    const rows = snap.sessions.map((s, i) => ({ s, i })).filter(({ i }) => i < fit)
    if (myIdx >= fit) rows[rows.length - 1] = { s: snap.sessions[myIdx]!, i: myIdx }
    const usedBy = (list: typeof rows) => list.reduce((a, r) => a + perRow + (r.s.stop ? 1 : 0), 0)
    while (rows.length > 1 && usedBy(rows) > budget) rows.splice(rows.length - 2, 1)
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
            {mode !== 'narrow' && <Text weight="medium" color={myBypass ? CLAY : undefined}>{L('Esta sesión ', 'This session ')}</Text>}
            <Text weight="semibold" tabular>{fmt(snap.current)} %</Text>
            <Text dimColor>{mode === 'wide' ? L(` de ${fmt(snap.fiveHour)} % usado`, ` of ${fmt(snap.fiveHour)} % used`) : ` / ${fmt(snap.fiveHour)} %`}</Text>
          </Text>
          {track(W.head, snap.current, snap.fiveHour - snap.current, true, snap.sessions.find(s => s.id === me)?.cap)}
          <Box flexGrow={1} />
          {(() => {
            const c = paceColor(snap.fiveHour, snap.resetsAt, now)
            const dot = !c ? null : Svg ? (
              <Svg source={dotSvg(c)} alt={L('ritmo de uso', 'usage pace')} width={10} height={10} isInteractive={BLINKS.includes(c)} />
            ) : (
              <Text size="caption" color={c}>●</Text>
            )
            if (braked) {
              return (
                <Text size="caption" color="#ef4444" wrap="truncate">{(() => {
                  const kind = snap.sessions.find(s => s.id === me)?.stop
                  if (!resume) return L('⏸ pausada', '⏸ paused')
                  const iso = new Date(resume).toISOString()
                  const why = kind === 'semanal' ? L('tope semanal', 'weekly cap') : kind === 'tope' ? L('tope 5 h', '5-h cap') : kind === 'limite' ? L('límite 5 h', '5-h limit') : L('freno 5 h', '5-h brake')
                  const when = kind === 'semanal' ? dayHour(iso) : hhmm(iso)
                  return mode === 'wide' ? L(`⏸ ${why} · reanuda ${when}`, `⏸ ${why} · resumes ${when}`) : `⏸ ${why} · ${when}`
                })()}</Text>
              )
            }
            return (
              <Box flexDirection="row" alignItems="center" gap="xs">
                {dot}
                {mySched && <Text size="caption" color={SCHED_COLOR}>⏱</Text>}
                {snap.resetsAt && sleepsThrough(snap.resetsAt) && <Text size="caption" color="#a5b4fc">☾</Text>}
                <Text size="caption" dimColor wrap="truncate">{!snap.resetsAt ? (mode === 'wide' ? L('bloque nuevo · empieza con tu próximo mensaje', 'new block · starts with your next message') : L('bloque nuevo', 'new block')) : mode === 'wide' ? L(`se reinicia en ${left(snap.resetsAt, now)}`, `resets in ${left(snap.resetsAt, now)}`) : leftShort(snap.resetsAt, now)}</Text>
              </Box>
            )
          })()}
          <Button key="config" label="⚙" onPress={() => void update($, cfgTab, () => 'ajustes').then(() => $.ui.open({ id: HISTORY_PANE, title: paneTitle() })).then(() => refresh($).catch(() => {}))} />
          <Button key="toggle" label={open ? '⌄' : '›'} onPress={toggle} />
        </Box>
        {open && (
          <Box flexDirection="column" gap="xs" paddingTop="xs">
            {rows.map(({ s, i }) => {
              const tag = stopLabel(s)
              const name = (
                <Text size="caption" weight={s.id === me || s.bypass ? 'medium' : 'regular'} dimColor={s.id !== me && !s.bypass} color={s.bypass ? CLAY : undefined} wrap="truncate">
                  {i + 1}. {s.bypass ? '∞ ' : ''}{cut(s.title, W.title)}
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
                  ? <Button key={`up-${s.id}`} label={s.bypass ? L('∞ activo', '∞ on') : '∞'} dimColor={!s.bypass && bypassFull} variant={s.bypass ? 'primary' : undefined} onPress={() => void (s.bypass ? undefined : toggleBypass($, s.id))} />
                  : <Button key={`up-${s.id}`} label="+" onPress={() => void stepCap($, s.id, 1)} />,
                s.stop
                  ? <Button key={`p-${s.id}`} label={mode === 'narrow' ? '▶' : L('▶ Reanudar', '▶ Resume')} variant="primary" onPress={() => void releaseSession($, s.id)} />
                  : <Button key={`p-${s.id}`} label="⏸" onPress={() => void setPaused($, s.id, true)} />,
              ]
              const tagLine = tag && <Text size="caption" color={tag.color} wrap="truncate">{tag.text}</Text>
              if (mode === 'narrow') {
                return (
                  <Box key={s.id} flexDirection="column">
                    <Box flexDirection="row" gap="sm">{name}<Box flexGrow={1} />{pct}</Box>
                    <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>{bar}<Box flexGrow={1} />{buttons}</Box>
                    {tagLine}
                  </Box>
                )
              }
              return (
                <Box key={s.id} flexDirection="column">
                  <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                    <Box width={W.name}>{name}</Box>
                    {bar}
                    {pct}
                    <Box flexGrow={1} />
                    {buttons}
                  </Box>
                  {tagLine}
                </Box>
              )
            })}
            {(() => {
              const more = snap.sessions.length - rows.length
              const moreBtn = more > 0 && <Button key="all" label={L(`+${more} más ›`, `+${more} more ›`)} onPress={() => void update($, cfgTab, () => 'sesiones').then(() => $.ui.open({ id: HISTORY_PANE, title: paneTitle() })).then(() => refresh($).catch(() => {}))} />
              if (snap.weekly === null) return moreBtn ? <Box flexDirection="row" alignItems="center" minHeight={2}><Box flexGrow={1} />{moreBtn}</Box> : null
              const c = paceColor(snap.weekly, snap.weeklyResetsAt, now, SEVEN_DAYS)
              const dot = !c ? null : Svg ? (
                <Svg source={dotSvg(c)} alt={L('ritmo semanal', 'weekly pace')} width={10} height={10} isInteractive={BLINKS.includes(c)} />
              ) : (
                <Text size="caption" color={c}>●</Text>
              )
              const ms = snap.weeklyResetsAt && now ? Date.parse(snap.weeklyResetsAt) - now : 0
              const rest = ms > 0 ? (ms >= 86400e3 ? `${Math.floor(ms / 86400e3)} d ${Math.floor((ms % 86400e3) / 3600e3)} h` : `${Math.floor(ms / 3600e3)} h`) : ''
              return (
                <Box flexDirection="row" alignItems="center" gap="xs" minHeight={moreBtn ? 2 : undefined}>
                  <Text size="caption" dimColor wrap="truncate">{mode === 'wide' ? L('Semanal · todos los modelos', 'Weekly · all models') : L('Semanal', 'Weekly')} {fmt(snap.weekly)} %</Text>
                  {dot}
                  {rest && <Text size="caption" dimColor wrap="truncate">{mode === 'wide' ? L(`se reinicia en ${rest}`, `resets in ${rest}`) : rest}</Text>}
                  {(() => {
                    const mine = snap.sessions.find(s => s.id === me)
                    if (!mine || (mine.wcap ?? 100) >= 100) return null
                    const near = (mine.wpct ?? 0) >= (mine.wcap ?? 100) * (CFG.warnPct / 100)
                    return <Text size="caption" wrap="truncate" color={near ? '#facc15' : undefined} dimColor={!near}>{L(` · esta sesión ${fmt(mine.wpct ?? 0)} % / ${fmt(mine.wcap ?? 100)} %`, ` · this session ${fmt(mine.wpct ?? 0)} % / ${fmt(mine.wcap ?? 100)} %`)}</Text>
                  })()}
                  <Box flexGrow={1} />
                  {moreBtn}
                </Box>
              )
            })()}
            {braked && (
              <Box flexDirection="row" alignItems="center" gap="sm" minHeight={2}>
                <Box flexGrow={1} />
                <Button key="continue" label={L('Continuar', 'Continue')} variant="primary" onPress={() => void $.command.run({ command: 'uso-continuar', args: '' })} />
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
