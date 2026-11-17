import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'uso-por-sesion', component: 'AbovePrompt', surface: 'desktop',
  props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 120, scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('tocar ∞ lo activa y la fila cambia', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  expect(JSON.stringify(await ui.find({ type: 'Text', text: /Mía/ }))).toContain('#a5b4fc')
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'up-yo' }))).toContain('∞ activo')
  await ui.press({ key: 'dn-yo' })
  expect(store.has('sinfreno:yo')).toBe(false)
  await ui.unmount()
})

test('con el máximo de ∞ activo, la otra fila se dibuja igual', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['tope:otra', 20]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['pausa:otra', true]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
  setup(on, store, 30, [{ id: 'a', title: 'A', w: 9 }, { id: 'b', title: 'B', w: 8 }, { id: 'c', title: 'C', w: 7 }, { id: 'd', title: 'D', w: 6 }, { id: 'yo', title: 'Mía', w: 1 }])
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 13 } })
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /5\. Mía/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'config' })).toBeTruthy()
  await ui.unmount()
})

test('una sesión abierta sin uso aparece con el nombre de su carpeta', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['activas', { nueva: { folder: 'linkedin', seen: Date.now() } }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['tope-sem:yo', 30]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
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
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['activas', { otra: { folder: 'Reportes', seen: Date.now() } }]])
  setupWeek(on, store, { sessions: [{ id: 'yo', title: 'Mía', w: 1 }], weekly: [], titles: { yo: 'Mía', otra: 'Proyecto minería' } })
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Proyecto minería/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Sesión en Reportes/ })).toBeFalsy()
  await ui.unmount()
})

test('el gráfico semanal permite ver una semana anterior', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['historial', [
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

test('/uso-continuar todas no desactiva el tope semanal de quien no estaba frenada por él', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['tope-sem:otra', 90]])
  setupWeek(on, store, { sessions: [{ id: 'yo', title: 'Mía', w: 1 }, { id: 'otra', title: 'Otra', w: 1 }], weekly: [{ id: 'yo', title: 'Mía', ww: 1 }, { id: 'otra', title: 'Otra', ww: 1 }], titles: {} })
  await $.command.run({ command: 'uso-limite', args: '90' })
  await $.command.run({ command: 'uso-continuar', args: 'todas' })
  expect(store.has('tope-sem-ok:otra')).toBe(false)
})

test('pausada y sobre su tope semanal: un solo Reanudar libera ambas cosas', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['pausa:otra', true], ['tope-sem:otra', 20]])
  setupWeek(on, store, { sessions: [{ id: 'yo', title: 'Mía', w: 1 }, { id: 'otra', title: 'Otra', w: 1 }], weekly: [{ id: 'otra', title: 'Otra', ww: 9 }, { id: 'yo', title: 'Mía', ww: 1 }], titles: {} })
  await $.command.run({ command: 'uso-limite', args: '90' })
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Pausada por ti/ })).toBeTruthy()
  await ui.press({ key: 'p-otra' })
  expect(store.has('pausa:otra')).toBe(false)
  expect(store.has('tope-sem-ok:otra')).toBe(true)
  await ui.unmount()
})

test('"Pausar todas" llega también a la 9.ª sesión en adelante', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: `S${i}`, w: 10 - i }))
  setup(on, store, 30, [...many, { id: 'yo', title: 'Mía', w: 0.5 }])
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-limite', args: '90' })
  await $.command.run({ command: 'uso-config', args: '' })
  const pane = await $.ui.mount({
    plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
    props: { title: 'Uso por sesión', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  await pane.press({ key: 'tab-sesiones' })
  await pane.press({ key: 'pause-all' })
  expect(store.get('pausa:s9')).toBe(true)
  await pane.unmount()
})

const PANE = {
  plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
  props: { title: 'Uso por sesión', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

test('desde el panel se programa un prompt, se edita y se le agrega un seguimiento', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
  setup(on, store, 30, [{ id: 'yo', title: 'Mía', w: 1 }])
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-limite', args: '90' })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'pn-yo' })
  await pane.input({ key: 'si-yo', text: 'Arma el informe', kind: 'change' })
  await pane.press({ key: 'st-time-yo' })
  await pane.input({ key: 'sh-yo', text: '7:30', kind: 'change' })
  await pane.press({ key: 'ss-yo' })
  const list = store.get('programados') as { id: string; text: string; type: string; time: string; after: string | null }[]
  expect(list.length).toBe(1)
  expect(list[0]!.type).toBe('time')
  expect(list[0]!.time).toBe('07:30')
  const id = list[0]!.id
  await pane.press({ key: `pe-${id}` })
  await pane.input({ key: 'si-yo', text: 'Arma el informe final', kind: 'change' })
  await pane.press({ key: 'ss-yo' })
  expect((store.get('programados') as { text: string }[])[0]!.text).toBe('Arma el informe final')
  await pane.press({ key: `pf-${id}` })
  await pane.input({ key: 'si-yo', text: 'Revisa las figuras', kind: 'change' })
  await pane.press({ key: 'ss-yo' })
  const after = store.get('programados') as { text: string; after: string | null }[]
  expect(after.find(i => i.text === 'Revisa las figuras')!.after).toBe(id)
  await pane.press({ key: `px-${id}` })
  const left = store.get('programados') as { text: string; after: string | null; type: string }[]
  expect(left.length).toBe(1)
  expect(left[0]!.after).toBe(null)
  expect(left[0]!.type).toBe('time')
  await pane.unmount()
})

test('un prompt programado vacío no se guarda y avisa', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
  setup(on, store, 30, [{ id: 'yo', title: 'Mía', w: 1 }])
  await $.command.run({ command: 'uso-limite', args: '90' })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'pn-yo' })
  await pane.press({ key: 'ss-yo' })
  expect(store.get('programados')).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /Escribe el prompt primero/ })).toBeTruthy()
  await pane.unmount()
})

test('a su hora sale el prompt programado y no su seguimiento', async ($, on) => {
  const sent: string[] = []
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }], ['programados', [
    { id: 'a', sid: 'yo', text: 'Primero', type: 'next', at: Date.now() - 1000, after: null },
    { id: 'b', sid: 'yo', text: 'Después', type: 'next', at: Date.now() - 1000, after: 'a' },
    { id: 'c', sid: 'otra', text: 'De otra sesión', type: 'next', at: Date.now() - 1000, after: null },
  ]]])
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('prompt.submit', (_, e) => (sent.push(e.text), { text: e.text }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('clock.every', () => ({ value: {} }))
  on('session.cwd', () => ({ value: '/' }))
  on('turn.complete', () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  expect(sent).toEqual(['Primero'])
  const left = store.get('programados') as { id: string }[]
  expect(left.map(i => i.id).sort()).toEqual(['b', 'c'])
  await $.turn.complete({ reason: 'answer', answer: 'listo' } as never)
  expect(sent).toEqual(['Primero', 'Después'])
  expect((store.get('programados') as { id: string }[]).map(i => i.id)).toEqual(['c'])
})

test('los comandos programan, listan, agregan seguimiento y cancelan', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }]])
  setup(on, store, 30, [{ id: 'yo', title: 'Mía', w: 1 }])
  await $.command.run({ command: 'uso-limite', args: '90' })
  const bad = await $.command.run({ command: 'uso-programar', args: 'mañana algo' })
  expect(String(bad?.text)).toMatch(/Uso:/)
  await $.command.run({ command: 'uso-programar', args: '23:30 Revisa los tests' })
  await $.command.run({ command: 'session-schedule', args: '23:45 Arma el informe' })
  const list = store.get('programados') as { text: string; type: string; time: string }[]
  expect(list.map(i => [i.type, i.text])).toEqual([['time', 'Revisa los tests'], ['time', 'Arma el informe']])
  const q = await $.command.run({ command: 'uso-programados', args: '' })
  const n = String(q?.text).split('\n').find(l => l.includes('Revisa los tests'))?.match(/^(\d+)\./)?.[1]
  expect(n).toBeTruthy()
  await $.command.run({ command: 'uso-seguimiento', args: `${n} Y luego súbelo` })
  const withFollow = store.get('programados') as { text: string; after: string | null }[]
  expect(withFollow.find(i => i.text === 'Y luego súbelo')?.after).toBeTruthy()
  const q2 = await $.command.run({ command: 'uso-programados', args: '' })
  const n2 = String(q2?.text).split('\n').find(l => l.includes('Revisa los tests'))?.match(/^(\d+)\./)?.[1]
  await $.command.run({ command: 'uso-cancelar', args: n2! })
  const left = store.get('programados') as { text: string; after: string | null }[]
  expect(left.find(i => i.text === 'Revisa los tests')).toBeUndefined()
  expect(left.find(i => i.text === 'Y luego súbelo')?.after).toBeNull()
  await $.command.run({ command: 'uso-cancelar', args: 'todos' })
  expect(store.get('programados')).toEqual([])
})

test('en inglés los comandos programados responden en inglés y la pestaña Commands los muestra', async ($, on) => {
  const store = new Map<string, unknown>([['config', { lang: 'en', sleepStart: 0, sleepEnd: 0 }]])
  setup(on, store, 30, [{ id: 'yo', title: 'Mine', w: 1 }])
  await $.command.run({ command: 'session-limit', args: '90' })
  expect(String((await $.command.run({ command: 'session-schedule', args: 'tomorrow x' }))?.text)).toMatch(/^Usage: \/session-schedule/)
  expect(String((await $.command.run({ command: 'session-schedule', args: '23:30 Check the tests' }))?.text)).toMatch(/^Scheduled in this session: (Today|Tomorrow) 23:30/)
  expect(String((await $.command.run({ command: 'session-scheduled', args: '' }))?.text)).toMatch(/Scheduled in this session:\n1\. (Today|Tomorrow) 23:30: Check the tests/)
  expect(String((await $.command.run({ command: 'session-follow-up', args: '1 Then push it' }))?.text)).toMatch(/^Follow-up added/)
  expect(String((await $.command.run({ command: 'session-unschedule', args: 'all' }))?.text)).toBe('Canceled 2 prompts in this session.')
  expect(String((await $.command.run({ command: 'session-unschedule', args: '' }))?.text)).toMatch(/^Usage: \/session-unschedule/)
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-ayuda' })
  for (const t of [/^Pane and band$/, /^Pause and resume$/, /^Caps$/, /^Brake$/, /^✉ Scheduled prompts$/, /^\/session-schedule \[n\] block/, /^\/session-unschedule <n> \| all$/, /spend no tokens/])
    expect(await pane.find({ type: 'Text', text: t })).toBeTruthy()
  await pane.unmount()
})

// Motor para los envíos programados: uso del bloque ajustable, prompts enviados y fin de turno.
function schedEnv(on: Parameters<Parameters<typeof test>[1]>[1], store: Map<string, unknown>, sent: string[], pct = { v: 10 }) {
  const resetsAt = new Date(Date.now() + 3600e3).toISOString()
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: pct.v, resetsAt }] } }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ sessions: [{ id: 'yo', title: 'Mía', w: 1 }] }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.now() }))
  on('prompt.submit', (_, e) => (sent.push(e.text), { text: e.text }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('clock.every', () => ({ value: {} }))
  on('session.cwd', () => ({ value: '/' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.start', () => ({ turnId: 't1' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  return pct
}
const cfgOff = () => ['config', { lang: 'es', sleepStart: 0, sleepEnd: 0 }] as [string, unknown]
const chain = () => ['programados', [
  { id: 'a', sid: 'yo', text: 'Primero', type: 'next', at: Date.now() - 1000, after: null },
  { id: 'b', sid: 'yo', text: 'Después', type: 'next', at: Date.now() - 1000, after: 'a' },
]] as [string, unknown]

test('el fin de un subagente no suelta el seguimiento; el fin del turno sí', async ($, on) => {
  const sent: string[] = []
  const store = new Map<string, unknown>([cfgOff(), chain()])
  schedEnv(on, store, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  expect(sent).toEqual(['Primero'])
  await $.turn.complete({ reason: 'answer', answer: 'parte', agentId: 'sub-1' } as never)
  expect(sent).toEqual(['Primero'])
  await $.turn.complete({ reason: 'answer', answer: 'listo' } as never)
  expect(sent).toEqual(['Primero', 'Después'])
})

test('si el freno corta el prompt, el seguimiento espera a que se retome', async ($, on) => {
  const sent: string[] = []
  const store = new Map<string, unknown>([cfgOff(), chain()])
  const pct = schedEnv(on, store, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  expect(sent).toEqual(['Primero'])
  pct.v = 90
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r).toBe(true)
  await $.turn.complete({ reason: 'answer', answer: 'Me detengo por el freno.' } as never)
  expect(sent).toEqual(['Primero'])
  expect((store.get('programados') as { id: string; after: string | null }[]).find(i => i.id === 'b')!.after).toBe('a')
})

test('si interrumpes el prompt, el seguimiento queda en espera y no sale solo', async ($, on) => {
  const sent: string[] = []
  const store = new Map<string, unknown>([cfgOff(), chain()])
  schedEnv(on, store, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  await $.turn.complete({ reason: 'aborted', answer: '' } as never)
  expect(sent).toEqual(['Primero'])
  const b = (store.get('programados') as { id: string; held?: boolean; after: string | null }[]).find(i => i.id === 'b')!
  expect(b.held).toBe(true)
  expect(b.after).toBe(null)
})

test('nada programado sale mientras la sesión está trabajando', async ($, on) => {
  const sent: string[] = []
  const store = new Map<string, unknown>([cfgOff()])
  schedEnv(on, store, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  store.set('programados', [{ id: 'x', sid: 'yo', text: 'Ahora', type: 'next', at: Date.now() - 1000, after: null }])
  await $.command.run({ command: 'uso-programar', args: '23:59 Otro' })
  expect(sent).toEqual([])
  await $.turn.complete({ reason: 'answer', answer: 'listo' } as never)
  expect(sent).toEqual(['Ahora'])
})
