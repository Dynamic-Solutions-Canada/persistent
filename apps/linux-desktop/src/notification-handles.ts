/** Application handles never reuse a daemon ID after that daemon changes ownership. */
export interface NotificationOwner { CloseNotification(id: number): Promise<void> }
export interface Publication { owner: NotificationOwner; nativeId: number }

export class NotificationHandles {
  private next = 1
  private entries = new Map<number, Publication>()

  /** Replacements reuse a handle only within one pinned daemon connection. */
  register(owner: NotificationOwner, nativeId: number): number {
    if (!Number.isInteger(nativeId) || nativeId <= 0 || nativeId > 0xffffffff) throw new Error('Invalid notification service ID')
    const existing = this.find(owner, nativeId)
    if (existing) return existing
    const handle = this.next++
    this.entries.set(handle, { owner, nativeId })
    return handle
  }

  find(owner: NotificationOwner, nativeId: number): number | undefined {
    for (const [handle, entry] of this.entries) {
      if (entry.owner === owner && entry.nativeId === nativeId) return handle
    }
    return undefined
  }

  replacement(handle: number, owner: NotificationOwner): number {
    const entry = this.entries.get(handle)
    return entry?.owner === owner ? entry.nativeId : 0
  }

  /** Forget before closing, so intentional removal signals cannot restore an obligation. */
  take(handle: number): Publication | undefined {
    const entry = this.entries.get(handle)
    this.entries.delete(handle)
    return entry
  }

  /** Retire IDs while keeping the monotonically increasing application-handle counter. */
  retire(): Publication[] {
    const previous = [...this.entries.values()]
    this.entries.clear()
    return previous
  }
}
