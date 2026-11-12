/** The guide must explain before launching anything, advance on readiness, and close once. */
import { after, test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import type { AlarmGrant, AlarmReadiness, GrantRoute } from './alarmGrants.js'
import type { PermissionGuideOutcome } from './PermissionGuideDialogContent.js'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
const previous = new Map<string, PropertyDescriptor | undefined>()
const globals = {
  React, window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, DocumentFragment: dom.window.DocumentFragment,
  IS_REACT_ACT_ENVIRONMENT: true
}
for (const [name, value] of Object.entries(globals)) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, value })
}

after(() => {
  dom.window.close()
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

const require = createRequire(import.meta.url)
const { PermissionGuideDialogContent } = require('./PermissionGuideDialogContent.tsx') as typeof import('./PermissionGuideDialogContent.js')
const { StartupDataContext } = require('../../components/startupDataContext.ts') as typeof import('../../components/startupDataContext.js')
const { setToastHandler } = require('../../lib/toast.ts') as typeof import('../../lib/toast.js')

const ALL: AlarmGrant[] = ['notifications', 'exactAlarms', 'fullScreen', 'overlay', 'battery']

/** Readiness with every grant held except the ones listed. */
function missing(...grants: AlarmGrant[]): AlarmReadiness {
  return Object.fromEntries(ALL.map((grant) => [grant, !grants.includes(grant)])) as AlarmReadiness
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })

/** Render the real Joy dialog with controlled readiness and a recorded launcher. */
async function mount(context: TestContext, scope: AlarmGrant[], options: { opens?: boolean; recheck?: AlarmReadiness } = {}) {
  const root = createRoot(dom.window.document.getElementById('root')!)
  const launches: [AlarmGrant, GrantRoute][] = []
  const closes: PermissionGuideOutcome[] = []
  const toasts: string[] = []
  setToastHandler((message) => toasts.push(message))

  const render = async (readiness: AlarmReadiness | null, mounted = true) => {
    await act(async () => root.render(
      <StartupDataContext.Provider value={true}>
        {mounted && <PermissionGuideDialogContent
          scope={scope}
          readiness={readiness}
          refresh={async () => options.recheck ?? null}
          launch={async (grant, route) => {
            launches.push([grant, route])
            return options.opens ?? true
          }}
          onClose={(outcome) => { closes.push(outcome) }}
        />}
      </StartupDataContext.Provider>
    ))
    await settle()
  }

  context.after(async () => {
    setToastHandler(null)
    await act(async () => root.unmount())
    await new Promise((resolve) => setTimeout(resolve, 30))
    dom.window.history.replaceState(null, '', '/')
  })

  const shows = (text: string) => dom.window.document.body.textContent?.includes(text) ?? false
  const press = async (label: string) => {
    const button = [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent === label)
    assert.ok(button, `no ${label} button`)
    await act(async () => button.click())
    await settle()
  }
  return { render, launches, closes, toasts, shows, press }
}

test('nothing opens until Continue, and returning with the grant on moves to the next one', async (context) => {
  const guide = await mount(context, ALL)
  await guide.render(missing('fullScreen', 'overlay'))
  assert.ok(guide.shows('Allow full-screen notifications'))
  assert.ok(guide.shows('turn on Allow full-screen notifications'))
  assert.deepEqual(guide.launches, [])

  await guide.press('Continue')
  assert.deepEqual(guide.launches, [['fullScreen', 'settings']])
  assert.ok(guide.shows('come back to Persistent'))

  // The app resumes from settings with the grant on.
  await guide.render(missing('overlay'))
  assert.ok(guide.shows('Allow display over other apps'))
  assert.equal(guide.launches.length, 1)
  assert.deepEqual(guide.closes, [])
})

test('a screen the phone cannot open shows where to find it, and Not now finishes once', async (context) => {
  const guide = await mount(context, ['exactAlarms'], { opens: false })
  await guide.render(missing('exactAlarms'))
  await guide.press('Continue')
  assert.ok(guide.shows("This phone didn't open that screen"))
  assert.ok(guide.shows('Alarms & reminders'))

  await guide.press('Not now')
  assert.deepEqual(guide.closes, [{ declined: ['exactAlarms'], shown: ['exactAlarms'] }])
  assert.deepEqual(guide.toasts, [])
  await guide.render(missing('exactAlarms'))
  assert.equal(guide.closes.length, 1)
})

test('granting the one grant a banner asked about does not claim full setup while others remain', async (context) => {
  const guide = await mount(context, ['overlay'])
  await guide.render(missing('overlay', 'battery'))
  await guide.press('Continue')
  await guide.render(missing('battery'))
  assert.deepEqual(guide.closes, [{ declined: [], shown: ['overlay'] }])
  assert.deepEqual(guide.toasts, [])
})

test('granting the last missing grant confirms full setup', async (context) => {
  const guide = await mount(context, ['overlay'])
  await guide.render(missing('overlay'))
  await guide.press('Continue')
  await guide.render(missing())
  assert.deepEqual(guide.closes, [{ declined: [], shown: ['overlay'] }])
  assert.deepEqual(guide.toasts, ['Alarms are fully set up'])
})

test('nothing is shown or reported as asked when everything is already granted', async (context) => {
  const guide = await mount(context, ALL)
  await guide.render(missing())
  assert.equal(guide.shows('Continue'), false)
  assert.deepEqual(guide.closes, [{ declined: [], shown: [] }])
  assert.deepEqual(guide.toasts, [])
})

/** The dialog-stack tokens in the current history entry. */
function historyDialogStack(): unknown {
  const state = dom.window.history.state as Record<string, unknown> | null
  return state?.__persistentDialogStack ?? []
}

test('finishing pops the history entry the dialog pushed, so the next Back is not swallowed', async (context) => {
  const guide = await mount(context, ['overlay'])
  await guide.render(missing('overlay'))
  assert.equal((historyDialogStack() as unknown[]).length, 1)
  await guide.press('Continue')
  await guide.render(missing())
  // The parent unmounts the guide once it reports closing, as the banner and onboarding do.
  await guide.render(missing(), false)
  await settle()
  assert.deepEqual(historyDialogStack(), [])
})

test('a screen that opens nothing because the grant is already on finishes instead of blaming the phone', async (context) => {
  const guide = await mount(context, ['overlay'], { opens: false, recheck: missing() })
  await guide.render(missing('overlay'))
  await guide.press('Continue')
  assert.equal(guide.shows("This phone didn't open that screen"), false)
  assert.deepEqual(guide.closes, [{ declined: [], shown: ['overlay'] }])
})
