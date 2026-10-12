/** Trusted, packaged settings/audio UI has separate IPC from the hosted application. */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('persistentLocal', {
  request: (message: unknown) => ipcRenderer.invoke('persistent:local', message),
  onSettings: (handler: (state: unknown) => void) => {
    ipcRenderer.on('persistent:local-state', (_event, state: unknown) => handler(state))
  },
  onAudio: (handler: (active: boolean) => void) => {
    ipcRenderer.on('persistent:audio', (_event, active: boolean) => handler(active))
  }
})
