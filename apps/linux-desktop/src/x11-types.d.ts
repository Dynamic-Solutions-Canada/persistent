/** Narrow declarations for the maintained X11 client's EWMH transport. */
export interface XClient {
  on(event: 'error', handler: (error: Error) => void): void
  screenNum: number | string
  stream?: { destroy(): void }
  terminate(): void
  sync(): Promise<void>
  InternAtom(onlyIfExists: boolean, name: string, callback: (error: Error | null, atom: number) => void): void
  SendClientMessage(root: number, window: number, type: number, format: number, data: number[]): void
}
export interface XDisplay { client: XClient; screen: { root: number }[] }
