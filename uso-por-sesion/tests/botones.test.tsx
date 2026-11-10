import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'uso-por-sesion', component: 'AbovePrompt', surface: 'desktop',
  props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 120, scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('tocar ∞ lo activa y la fila cambia', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }, { id: 'otra', title: 'Otra', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  await $.command.run({ command: 'uso-limite', args: '100' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  
  await ui.press({ key: 'up-yo' })
  expect(store.get('sinfreno:yo')).toBe(resetsAt)
  expect(JSON.stringify(await ui.find({ type: 'Text', text: /Mía/ }))).toContain('#d97757')
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'up-yo' }))).toContain('∞ activo')
  await ui.press({ key: 'dn-yo' })
  expect(store.has('sinfreno:yo')).toBe(false)
  await ui.unmount()
})

test('con el máximo de ∞ activo, la otra fila se dibuja igual', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  store.set('sinfreno:yo', resetsAt)
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }, { id: 'otra', title: 'Otra', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  await $.command.run({ command: 'uso-limite', args: '100' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Otra/ })).toBeTruthy()
  await ui.unmount()
})

test('el ∞ sigue activo aunque la hora de reinicio varíe unos segundos', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const base = Date.now() + 3600e3
  let n = 0
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: new Date(base + (n++ % 3) * 1000).toISOString() }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  await $.command.run({ command: 'uso-limite', args: '100' })
  await $.command.run({ command: 'uso-sin-freno', args: '' })
  await $.command.run({ command: 'uso-reanudar', args: '' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'up-yo' }))).toContain('∞ activo')
  await ui.press({ key: 'dn-yo' })
  expect(store.has('sinfreno:yo')).toBe(false)
  await ui.unmount()
})

test('con poco espacio la franja muestra las que caben y la pestaña Sesiones todas', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  const sessions = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Sesión ${i}`, w: 8 - i }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt }] } }))
  on('session.id', () => ({ value: 's0' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-limite', args: '30' })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 16 } })
  await ui.press({ key: 'toggle' })
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'all' }))).toContain('más')
  expect(await ui.find({ type: 'Text', text: /Sesión 7/ })).toBeFalsy()
  await ui.press({ key: 'all' })
  await ui.unmount()
  const pane = await $.ui.mount({
    plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
    props: { title: 'Uso por sesión', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: /Sesión 7/ })).toBeTruthy()
  await pane.unmount()
})

test('pasado el reinicio la franja muestra el bloque nuevo en 0', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const resetsAt = new Date(Date.now() - 60000).toISOString()
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 52, resetsAt }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  await $.command.run({ command: 'uso-limite', args: '30' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /bloque nuevo/ })).toBeTruthy()
  await ui.unmount()
})

test('una sesión recién abierta usa los últimos límites guardados', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  store.set('ultimo-limite', { five: { percentUsed: 47, resetsAt } })
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  await $.command.run({ command: 'uso-limite', args: '30' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /47 %/ })).toBeTruthy()
  await ui.unmount()
})

function setup(on: Parameters<Parameters<typeof test>[1]>[1], store: Map<string, unknown>, pct: number, sessions: { id: string; title: string; w: number }[]) {
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', () => ({ value: undefined }))
  return resetsAt
}

test('una sesión que llegó a su tope muestra por qué y el botón la reanuda', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }], ['tope:otra', 20]])
  setup(on, store, 50, [{ id: 'otra', title: 'Otra', w: 3 }, { id: 'yo', title: 'Mía', w: 2 }])
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /llegó a su tope/ })).toBeTruthy()
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'p-otra' }))).toContain('Reanudar')
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'p-yo' }))).toContain('⏸')
  await ui.press({ key: 'p-otra' })
  expect(store.has('tope-ok:otra')).toBe(true)
  await ui.unmount()
})

test('una sesión pausada dice "Pausada por ti" y Reanudar quita la pausa', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }], ['pausa:otra', true]])
  setup(on, store, 30, [{ id: 'otra', title: 'Otra', w: 1 }, { id: 'yo', title: 'Mía', w: 1 }])
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Pausada por ti/ })).toBeTruthy()
  await ui.press({ key: 'p-otra' })
  expect(store.has('pausa:otra')).toBe(false)
  await ui.unmount()
})

test('la sesión actual entra al desglose aunque no sea de las que más gastan', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  setup(on, store, 30, [{ id: 'a', title: 'A', w: 9 }, { id: 'b', title: 'B', w: 8 }, { id: 'c', title: 'C', w: 7 }, { id: 'd', title: 'D', w: 6 }, { id: 'yo', title: 'Mía', w: 1 }])
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 13 } })
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /5\. Mía/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'config' })).toBeTruthy()
  await ui.unmount()
})

test('una sesión abierta sin uso aparece con el nombre de su carpeta', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }], ['activas', { nueva: { folder: 'linkedin', seen: Date.now() } }]])
  setup(on, store, 30, [{ id: 'yo', title: 'Mía', w: 1 }])
  on('session.cwd', () => ({ value: 'C:/x/proyecto' }))
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Sesión en linkedin/ })).toBeTruthy()
  await ui.unmount()
})

function setupWeek(on: Parameters<Parameters<typeof test>[1]>[1], store: Map<string, unknown>, scan: object) {
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  const weekReset = new Date(Date.now() + 3 * 86400e3).toISOString()
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt }, { kind: 'seven_day', percentUsed: 60, resetsAt: weekReset }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(scan), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(JSON.stringify(e)), { value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('command.run', () => ({ text: '' }))
  on('prompt.submit', () => ({ value: undefined }))
  return { weekReset, toasts }
}

test('con tope semanal alcanzado, la franja dice "tope semanal" y la fila se puede reanudar', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }], ['tope-sem:yo', 30]])
  const { weekReset } = setupWeek(on, store, {
    sessions: [{ id: 'yo', title: 'Mía', w: 1 }, { id: 'otra', title: 'Otra', w: 1 }],
    weekly: [{ id: 'yo', title: 'Mía', ww: 6 }, { id: 'otra', title: 'Otra', ww: 4 }],
    titles: { yo: 'Mía', otra: 'Otra' },
  })
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /tope semanal/ })).toBeTruthy()
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /llegó a su tope semanal/ })).toBeTruthy()
  await ui.press({ key: 'p-yo' })
  expect(store.get('tope-sem-ok:yo')).toBe(weekReset)
  await ui.unmount()
})

test('el aviso semanal aparece cerca del tope y /uso-limite semanal lo ajusta', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }]])
  const { toasts } = setupWeek(on, store, {
    sessions: [{ id: 'yo', title: 'Mía', w: 1 }],
    weekly: [{ id: 'yo', title: 'Mía', ww: 1 }, { id: 'otra', title: 'Otra', ww: 1 }],
    titles: { yo: 'Mía' },
  })
  const r = await $.command.run({ command: 'uso-limite', args: 'semanal 35' })
  expect(JSON.stringify(r)).toContain('35 %')
  expect(store.get('tope-sem:yo')).toBe(35)
  expect(toasts.some(t => /tope semanal/.test(t))).toBe(true)
  await $.command.run({ command: 'uso-limite', args: 'semanal quitar' })
  expect(store.get('tope-sem:yo')).toBe(100)
})

test('una sesión abierta sin uso en el bloque muestra su título real', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }], ['activas', { otra: { folder: 'Reportes', seen: Date.now() } }]])
  setupWeek(on, store, { sessions: [{ id: 'yo', title: 'Mía', w: 1 }], weekly: [], titles: { yo: 'Mía', otra: 'Proyecto minería' } })
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Proyecto minería/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Sesión en Reportes/ })).toBeFalsy()
  await ui.unmount()
})

test('el gráfico semanal permite ver una semana anterior', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es' }], ['historial', [
    { resetsAt: new Date(Date.now() - 2 * 86400e3).toISOString(), pct: 40, weekly: 71, top: [] },
    { resetsAt: new Date(Date.now() - 5 * 86400e3).toISOString(), pct: 30, weekly: 40, top: [] },
  ]]])
  setupWeek(on, store, { sessions: [{ id: 'yo', title: 'Mía', w: 1 }], weekly: [], titles: {} })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-limite', args: '90' })
  await $.command.run({ command: 'uso-historial', args: '' })
  const pane = await $.ui.mount({
    plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
    props: { title: 'Uso por sesión', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect(await pane.find({ key: 'week' })).toBeTruthy()
  await pane.select({ key: 'week', value: '1' })
  expect(await pane.find({ type: 'Text', text: /terminó en 40 %/ })).toBeTruthy()
  await pane.unmount()
})
