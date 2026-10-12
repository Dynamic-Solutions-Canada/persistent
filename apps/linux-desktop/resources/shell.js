/* Display only native host state. No account data or domain actions belong to this chrome. */
const chrome = window.persistentChrome
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => chrome.action(button.dataset.action))
}
chrome.listen((state) => {
  document.querySelector('[data-action=pin]').setAttribute('aria-pressed', String(state.pinned))
  document.documentElement.style.colorScheme = state.mode
  if (state.background) document.documentElement.style.setProperty('--frame-background', state.background)
  document.querySelector('#status').hidden = state.status === 'ready'
  document.querySelector('#status-title').textContent = state.status === 'error' ? "Can't reach Persistent" : 'Loading Persistent'
  document.querySelector('#status-detail').textContent = state.status === 'error'
    ? 'Reload to try again, or check the server address in Connection settings.' : 'Connecting to your reminder service.'
  document.querySelector('#recovery').hidden = state.status !== 'error'
})
chrome.action('ready')
