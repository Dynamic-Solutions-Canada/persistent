/** Standard EWMH taskbar hints preserve normal X11 resizing and maximization. */
import x11 from 'x11'
import type { BrowserWindow } from 'electron'
import type { XDisplay } from './x11-types.js'

/** Convert Electron's native X11 handle without interpreting pointer-sized padding. */
export function x11WindowId(handle: Buffer): number {
  if (handle.length < 4) throw new Error('Invalid native X11 window handle')
  return handle.readUInt32LE(0)
}

/** Apply after mapping because Chromium replaces pre-map state properties on show. */
export function attachTaskbarHints(window: BrowserWindow, log: (message: string, error?: unknown) => void): void {
  window.on('show', () => {
    void hideFromTaskbar(window.getNativeWindowHandle()).catch((error: unknown) => log('Window taskbar hints could not be applied', error))
  })
}

/** Send an additive state request to the WM, then close this bounded authenticated connection. */
export async function hideFromTaskbar(handle: Buffer): Promise<void> {
  const wid = x11WindowId(handle)
  let display: XDisplay | undefined
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const request = new Promise<void>((resolve, reject) => {
    const client = x11.createClient((error, connected) => {
      if (error) { reject(error); return }
      display = connected
      if (timedOut) { connected.client.terminate(); return }
      void (async () => {
        const atoms = await Promise.all(['_NET_WM_STATE', '_NET_WM_STATE_SKIP_TASKBAR', '_NET_WM_STATE_SKIP_PAGER'].map((name) =>
          new Promise<number>((accept, fail) => connected.client.InternAtom(false, name, (failure, atom) => failure ? fail(failure) : accept(atom)))))
        if (timedOut) return
        // EWMH ADD, both hints, application source. Preserve maximized/above state.
        connected.client.SendClientMessage(connected.screen[Number(connected.client.screenNum)]!.root, wid, atoms[0]!, 32, [1, atoms[1]!, atoms[2]!, 1, 0])
        await connected.client.sync()
      })().then(resolve, reject)
    })
    client.on('error', reject)
    timer = setTimeout(() => {
      timedOut = true
      client.stream?.destroy()
      reject(new Error('X11 taskbar request timed out'))
    }, 1500)
  })
  try { await request }
  finally {
    if (timer) clearTimeout(timer)
    display?.client.terminate()
  }
}
