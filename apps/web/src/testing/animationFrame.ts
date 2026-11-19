/**
 * Animation-frame globals for component tests that run under JSDOM.
 *
 * web-app-kit's `BackAwareModal` schedules its focus and history work with
 * `requestAnimationFrame`. A JSDOM created without `pretendToBeVisual` has no animation frames, so
 * a test that renders a dialog spreads these into the globals it installs. A timer stands in for
 * the next frame, which keeps the work asynchronous, as in a browser.
 */

/** `requestAnimationFrame` and `cancelAnimationFrame`, backed by timers. */
export function animationFrameGlobals(): {
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  cancelAnimationFrame: (handle: number) => void
} {
  return {
    requestAnimationFrame: (callback) =>
      setTimeout(() => callback(Date.now()), 0) as unknown as number,
    cancelAnimationFrame: (handle) => clearTimeout(handle),
  }
}
