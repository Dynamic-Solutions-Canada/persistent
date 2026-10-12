/** Expose only a bounded desktop bridge, never IPC, profile cookies, or Node APIs. */
import { observeExternalLinks } from './external-links.js'
import { contextBridge, ipcRenderer } from 'electron'
if (process.isMainFrame) {
  observeExternalLinks(location.origin)
  contextBridge.exposeInMainWorld('persistentDesktop', {
    platform: 'linux',
    postMessage: (message: unknown) => ipcRenderer.send('persistent:host', message),
    addEventListener: (_type: 'message', handler: (event: { data: unknown }) => void) => {
      const listener = (_event: unknown, message: unknown) => handler({ data: message })
      listeners.set(handler, listener)
      ipcRenderer.on('persistent:page', listener)
    },
    removeEventListener: (_type: 'message', handler: (event: { data: unknown }) => void) => {
      const listener = listeners.get(handler)
      if (listener) ipcRenderer.removeListener('persistent:page', listener)
      listeners.delete(handler)
    }
  })
}
const listeners = new Map<(event: { data: unknown }) => void, (_event: unknown, message: unknown) => void>()
