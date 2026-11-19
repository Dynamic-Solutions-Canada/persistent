/**
 * A page-sent `close` right after the flyout opens is ignored (host contract gap #3), the
 * same 500 ms settle the Windows host applies. A page older than its host once answered the
 * host's open-time `checkForUpdate` with Back and so closed the flyout the moment it opened;
 * this keeps that kind of skew from making the flyout unusable.
 */

/** How long after opening the flyout a page `close` is ignored, as on Windows. */
export const CLOSE_SETTLE_MS = 500

/**
 * Whether a page `close` should hide the flyout.
 *
 * @param shownAtMs when the flyout was last shown, or 0 if never.
 * @param nowMs the current time.
 */
export function shouldHonourClose(
  shownAtMs: number,
  nowMs: number,
  settleMs = CLOSE_SETTLE_MS,
): boolean {
  return shownAtMs === 0 || nowMs - shownAtMs >= settleMs
}
