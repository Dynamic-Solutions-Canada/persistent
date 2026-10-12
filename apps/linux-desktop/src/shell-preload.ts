/** The local flyout chrome can send only named actions and receive display state. */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('persistentChrome', {
  action: (action: string) => ipcRenderer.send('persistent:chrome', action),
  listen: (handler: (state: unknown) => void) => ipcRenderer.on('persistent:chrome-state', (_event, state: unknown) => handler(state))
})
