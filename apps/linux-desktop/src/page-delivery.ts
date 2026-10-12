/** Buffer the latest host intent until its exact routing or authenticated action listener exists. */
export type PageRequest = { type: 'navigate'; path: string } | { type: 'snoozeOccurrence'; occurrenceId: string }

export class PageDelivery {
  private routingReady = false
  private actionsReady = false
  private pending: PageRequest | null = null

  constructor(private send: (request: PageRequest) => void) {}

  /** SPA routes and dialog history retain their listeners; only a new main document resets readiness. */
  navigating(details: { isMainFrame: boolean; isSameDocument: boolean }): void {
    if (!details.isMainFrame || details.isSameDocument) return
    this.routingReady = false
    this.actionsReady = false
  }

  ready(actions = false): void {
    if (actions) this.actionsReady = true
    else this.routingReady = true
    this.flush()
  }

  actionsGone(): void { this.actionsReady = false }
  queue(request: PageRequest): void { this.pending = request }
  discard(): void { this.pending = null }
  signedOut(): void { this.discard(); this.actionsReady = false }

  /** The caller shows/resumes first, so the page's freshness gate precedes any delivered action. */
  flush(): void {
    const request = this.pending
    if (!request || !this.routingReady || request.type === 'snoozeOccurrence' && !this.actionsReady) return
    this.pending = null
    this.send(request)
  }
}
