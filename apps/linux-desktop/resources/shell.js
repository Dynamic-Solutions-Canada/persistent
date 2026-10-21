/* Display only native host state. No account data or domain actions belong to this chrome. */
const chrome = window.persistentChrome
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => chrome.action(button.dataset.action))
}
chrome.listen((state) => {
  window.persistentText.applyLocalization(state.localization)
  document.querySelector('[data-action=pin]').setAttribute('aria-pressed', String(state.pinned))
  document.documentElement.style.colorScheme = state.mode
  if (state.background) document.documentElement.style.setProperty('--frame-background', state.background)
  document.querySelector('#status').hidden = state.status === 'ready'
  document.querySelector('#status-title').textContent = state.status === 'error' ? window.persistentText.text("Can't reach Persistent") : window.persistentText.text('Loading Persistent')
  document.querySelector('#status-detail').textContent = state.status === 'error'
    ? window.persistentText.text('Reload to try again, or check the server address in Connection settings.') : window.persistentText.text('Connecting to your reminder service.')
  document.querySelector('#recovery').hidden = state.status !== 'error'
})
chrome.action('ready')
