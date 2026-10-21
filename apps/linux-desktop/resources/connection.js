/* Packaged desktop settings mirror Windows navigation; reminder settings remain in the hosted app. */
const local = window.persistentLocal
const status = document.querySelector('#status')
let requestGeneration = 0

/** Apply only host-confirmed state, including rejected or cancelled connection changes. */
function applySnapshot(reply, current = true) {
  window.persistentText.applyLocalization(reply.localization)
  if (reply.update && current) applyUpdate(reply.update)
  if (current && typeof reply.maximized === 'boolean') {
    document.body.classList.toggle('maximized', reply.maximized)
    document.querySelector('#maximize').setAttribute('aria-label', window.persistentText.text(reply.maximized ? 'Restore' : 'Maximize'))
    document.querySelector('#maximize').title = window.persistentText.text(reply.maximized ? 'Restore' : 'Maximize')
  }
  if (current && reply.server) document.querySelector('#server').value = reply.server
  if (reply.version) document.querySelector('#version').textContent = window.persistentText.text('Version {{version}}', { version: reply.version })
  if (current && reply.appTheme) {
    document.querySelector('#theme').value = reply.appTheme
    document.documentElement.style.colorScheme = reply.appTheme === 'system' ? 'light dark' : reply.appTheme
  }
  if (typeof reply.trayAvailable === 'boolean') document.querySelector('#quit').hidden = reply.trayAvailable
  if (reply.apps) renderApps(reply.apps)
}

/** Background and manual update actions render the same host-authoritative state. */
function applyUpdate(update) {
  const busy = ['checking', 'downloading', 'installing'].includes(update.phase)
  document.querySelector('#update-status').textContent = update.message
  document.querySelector('#updateAutomatic').checked = update.automatic
  document.querySelector('#updates').disabled = busy
  document.querySelector('#updateDownload').hidden = !update.version || update.downloaded
  document.querySelector('#updateDownload').disabled = busy
  document.querySelector('#updateInstall').hidden = !update.downloaded
  document.querySelector('#updateInstall').disabled = busy
}

/** Keep host failures visible and settle controls without throwing out of DOM event handlers. */
async function request(message) {
  const generation = ++requestGeneration
  try {
    const reply = await local.request(message)
    if (reply.error) throw new Error(reply.error)
    // Initial tray discovery can settle after the user changes theme or server.
    // Keep static catalog data, but never echo an older mutable setting over it.
    applySnapshot(reply, generation === requestGeneration)
    if (generation === requestGeneration) status.textContent = reply.message || ''
    return reply
  } catch (error) {
    status.textContent = error.message || window.persistentText.text('The request could not be completed.')
    return null
  }
}

/** Sidebar selection and content panes stay in one reusable settings window. */
function selectPage(page) {
  for (const button of document.querySelectorAll('[data-page]')) {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== page
  status.textContent = ''
}

/** Catalog strings are text nodes; only validated bundled icon names and links are used. */
function renderApps(apps) {
  const list = document.querySelector('#app-list')
  list.replaceChildren()
  for (const app of apps) {
    const card = document.createElement('article')
    card.className = 'card promo-card'
    const icon = document.createElement('img')
    icon.src = `promo/${app.icon}`
    icon.alt = ''
    icon.width = 40
    icon.height = 40
    const details = document.createElement('div')
    details.className = 'app-details'
    const title = document.createElement('h2')
    title.textContent = app.name
    const description = document.createElement('p')
    description.textContent = app.blurb
    const actions = document.createElement('div')
    actions.className = 'actions'
    for (const link of app.links) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = link.label
      button.addEventListener('click', () => request({ type: 'promo', value: link.url }))
      actions.append(button)
    }
    details.append(title, description, actions)
    card.append(icon, details)
    list.append(card)
  }
}

for (const button of document.querySelectorAll('[data-page]')) {
  button.addEventListener('click', () => selectPage(button.dataset.page))
}
document.querySelector('#nav-toggle').addEventListener('click', (event) => {
  const collapsed = document.body.classList.toggle('nav-collapsed')
  event.currentTarget.setAttribute('aria-expanded', String(!collapsed))
})
document.querySelector('#connection').addEventListener('submit', async (event) => {
  event.preventDefault()
  await request({ type: 'server', value: document.querySelector('#server').value })
})
document.querySelector('#theme').addEventListener('change', (event) => request({ type: 'theme', value: event.target.value }))
for (const type of ['reset', 'clear', 'logs', 'source', 'privacy', 'appSettings', 'quit', 'minimize', 'maximize', 'close', 'updateDownload', 'updateInstall']) {
  document.querySelector(`#${type}`).addEventListener('click', () => request({ type }))
}
document.querySelector('#updates').addEventListener('click', () => request({ type: 'updates' }))
document.querySelector('#updateAutomatic').addEventListener('change', (event) => request({ type: 'updateAutomatic', value: event.target.checked }))
void request({ type: 'get' })
local.onSettings((state) => {
  if (state.page) { selectPage(state.page); return }
  if (state.update && Object.keys(state).length === 1) { applyUpdate(state.update); return }
  requestGeneration++
  applySnapshot(state)
})
