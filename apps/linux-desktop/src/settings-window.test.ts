/** Desktop settings preserve navigation state and reject late host echoes without interpreting catalog strings as markup. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

test('settings navigation preserves connection input; a late initial snapshot cannot undo theme selection', async () => {
  const dom = new JSDOM(readFileSync(new URL('../resources/connection.html', import.meta.url), 'utf8'), { runScripts: 'outside-only' })
  const messages: Array<{ type: string; value?: string }> = []
  let resolveInitial!: (reply: unknown) => void
  Object.defineProperty(dom.window, 'persistentLocal', { value: {
    request: async (message: { type: string; value?: string }) => {
      messages.push(message)
      if (message.type === 'get') return new Promise((resolve) => { resolveInitial = resolve })
      if (message.type === 'theme') return { appTheme: message.value }
      return {}
    }, onSettings: () => {}
  } })
  try {
    dom.window.eval(readFileSync(new URL('../resources/connection.js', import.meta.url), 'utf8'))
    const document = dom.window.document
    const input = document.querySelector<HTMLInputElement>('#server')!
    input.value = 'https://synthetic.example'
    document.querySelector<HTMLButtonElement>('[data-page=settings]')!.click()
    assert.equal(document.querySelector<HTMLElement>('[data-panel=settings]')!.hidden, false)
    const theme = document.querySelector<HTMLSelectElement>('#theme')!
    theme.value = 'light'
    theme.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(document.documentElement.style.colorScheme, 'light')
    resolveInitial({ server: 'https://old.example', appTheme: 'system', version: '0.1.0', trayAvailable: true, apps: [{ name: '<script>unsafe()</script>', blurb: 'Synthetic', icon: 'safe.png', links: [{ label: 'Visit website', url: 'https://synthetic.example' }] }] })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(document.documentElement.style.colorScheme, 'light')
    assert.equal(input.value, 'https://synthetic.example')
    assert.equal(document.querySelector('#app-list h2')!.textContent, '<script>unsafe()</script>')
    assert.equal(document.querySelector('#app-list script'), null)
    document.querySelector<HTMLButtonElement>('[data-page=connection]')!.click()
    assert.equal(input.value, 'https://synthetic.example')
    assert.equal(document.querySelector<HTMLElement>('[data-panel=settings]')!.hidden, true)
    assert.deepEqual(messages.map((message) => message.type), ['get', 'theme'])
  } finally { dom.window.close() }
})
