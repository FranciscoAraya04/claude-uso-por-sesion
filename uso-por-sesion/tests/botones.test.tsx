import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'uso-por-sesion', component: 'AbovePrompt', surface: 'desktop',
  props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 120, scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('tocar ∞ dos veces lo activa y la fila cambia', async ($, on) => {
  const store = new Map<string, unknown>()
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
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'up-yo' }))).toContain('¿Seguro?')
  await ui.press({ key: 'up-yo' })
  expect(store.get('sinfreno:yo')).toBe(resetsAt)
  expect(JSON.stringify(await ui.find({ type: 'Text', text: /Mía/ }))).toContain('claude')
  expect(JSON.stringify(await ui.find({ type: 'Button', key: 'up-yo' }))).toContain('∞ activo')
  await ui.press({ key: 'dn-yo' })
  expect(store.has('sinfreno:yo')).toBe(false)
  await ui.unmount()
})
