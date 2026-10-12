/** Only real link activation may request an external browser; script redirects are never launchers. */
import { ipcRenderer } from 'electron'
import { externalLinkIntent } from './security.js'

/** Capture native mouse/keyboard link clicks in the isolated preload, not a page-callable IPC method. */
export function observeExternalLinks(server: string): void {
  const clicked = (event: MouseEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target instanceof Element ? event.target.closest('a[href], area[href]') : null
    if (!(target instanceof HTMLAnchorElement || target instanceof HTMLAreaElement)) return
    const href = externalLinkIntent(event.isTrusted, target.href, server)
    if (!href) return
    event.preventDefault()
    event.stopImmediatePropagation()
    ipcRenderer.send('persistent:external', href)
  }
  document.addEventListener('click', clicked, true)
  document.addEventListener('auxclick', clicked, true)
}
