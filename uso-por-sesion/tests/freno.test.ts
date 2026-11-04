import { expect, test } from 'claude-code/testing'

const reset = () => new Date(Date.now() + 3600e3).toISOString()

// Motor simulado: uso del bloque, id de sesión y un almacén compartido en memoria.
const engine = (on: Parameters<Parameters<typeof test>[1]>[1], pct: number) => {
  const store = new Map<string, unknown>()
  const resetsAt = reset()
  on('session.usage', () => ({
    value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] },
  }))
  on('session.id', () => ({ value: 'yo' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'sin registros en la prueba', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('command.run', () => ({ text: '' }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', () => ({ value: {} }))
  return { store, resetsAt } as const

}

test('bajo el 83 % las herramientas pasan', async ($, on) => {
  engine(on, 50)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r).toBe(false)
})

test('desde el 83 % se frena y /uso-continuar lo libera', async ($, on) => {
  engine(on, 84)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r && String(r.deny)).toContain('Freno de uso')
  const p = await $.prompt.submit({ text: 'hola' })
  expect('drop' in p).toBe(true)
  await $.command.run({ command: 'uso-continuar', args: '' })
  const r2 = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r2).toBe(false)
})

test('/uso-continuar sin nada libera solo esta sesión', async ($, on) => {
  const { store } = engine(on, 84)
  await $.command.run({ command: 'uso-continuar', args: '' })
  expect(store.has('freno-aprobado')).toBe(false)
  expect(typeof store.get('freno-ok:yo')).toBe('string')
})

test('una sesión pausada se detiene y /uso-reanudar la libera', async ($, on) => {
  engine(on, 10)
  await $.command.run({ command: 'uso-pausar', args: '' })
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r && String(r.deny)).toContain('pausada')
  await $.command.run({ command: 'uso-reanudar', args: '' })
  const r2 = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r2).toBe(false)
})

test('/uso-limite guarda y quita el tope', async ($, on) => {
  const { store } = engine(on, 10)
  await $.command.run({ command: 'uso-limite', args: '40' })
  expect(store.get('tope:yo')).toBe(40)
  await $.command.run({ command: 'uso-limite', args: 'quitar' })
  expect(store.get('tope:yo')).toBe(0)
})

test('sin tope guardado, la sesión parte con 35 %', async ($, on) => {
  engine(on, 10)
  const r = await $.command.run({ command: 'uso-limite', args: '' })
  expect(String((r as { text: string }).text)).toContain('35')
})

test('el historial abre un panel aparte, vacío al comienzo', async ($, on) => {
  engine(on, 10)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-historial', args: '' })
  const ui = await $.ui.mount({
    plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
    props: { title: 'Historial de uso', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /Aún no hay bloques/ }))?.text).toContain("historial")
  await ui.unmount()
})

test('con datos, el historial dibuja gráficos', async ($, on) => {
  const { store } = engine(on, 10)
  const t = Date.now()
  store.set('historial', [0, 1, 2].map(i => ({
    resetsAt: new Date(t - i * 5 * 3600e3).toISOString(), pct: 40 + i * 20, weekly: 10 + i,
    top: [{ title: 'Sesión A', pct: 20 }, { title: 'Sesión B', pct: 10 }],
  })))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-historial', args: '' })
  const ui = await $.ui.mount({
    plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
    props: { title: 'Historial de uso', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  const chart = await ui.find({ type: 'Svg' })
  expect(chart).toBeTruthy()
  await ui.unmount()
})

test('el freno respeta el % configurado', async ($, on) => {
  const { store } = engine(on, 84)
  store.set('config', { brakeAt: 90 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('clock.every', () => ({ value: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r).toBe(false)
})

test('la configuración muestra los ajustes por defecto', async ($, on) => {
  engine(on, 10)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'uso-config', args: '' })
  const ui = await $.ui.mount({
    plugin: 'uso-por-sesion', component: 'Pane', requestId: 'uso-config', surface: 'desktop',
    props: { title: 'Uso por sesión', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /^83 %$/ }))?.text).toBe('83 %')
  await ui.unmount()
})

test('una sesión ∞ ignora el freno global pero se detiene antes del 100 %', async ($, on) => {
  const { store, resetsAt } = engine(on, 90)
  store.set('sinfreno:yo', resetsAt)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r).toBe(false)
})

test('una sesión ∞ cierra al llegar a 100 % menos el margen', async ($, on) => {
  const { store, resetsAt } = engine(on, 98.5)
  store.set('sinfreno:yo', resetsAt)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect('deny' in r && String(r.deny)).toContain('Límite real cerca')
})

test('/uso-sin-freno activa el ∞ de esta sesión', async ($, on) => {
  const { store, resetsAt } = engine(on, 10)
  await $.command.run({ command: 'uso-sin-freno', args: '' })
  expect(store.get('sinfreno:yo')).toBe(resetsAt)
})
