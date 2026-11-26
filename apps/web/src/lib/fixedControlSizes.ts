/**
 * The measured sizes of the app's fixed controls, shared with what has to clear them.
 *
 * `BottomNav` grows when a translated label wraps onto a second line, and it adds the
 * gesture-bar inset below its tabs. The floating New reminder button and the shell's
 * bottom padding used to assume a fixed one-line bar (72px and 80px), so a taller bar
 * slid over the button and left the end of a page under it. The New reminder button's
 * width changes with its translated label too. Both controls publish their size
 * (`publishSize`), and everything that clears them reads it from here, with a fallback
 * for while a control is not on screen or not yet measured.
 */
import { safeAreaInset } from './safeArea.js'
import { publishSize } from './publishedSize.js'

/** The custom property `BottomNav` writes its border-box height to. */
export const BOTTOM_NAV_HEIGHT_VAR = '--bottom-nav-height'

/**
 * Height of a one-line bar without the inset: the tab's 8px padding twice, a 20px
 * icon, a 2px gap, a 14.4px label line and the 1px top border, rounded up.
 */
const ONE_LINE_HEIGHT_PX = 57

/** CSS length of the bottom tab bar, including its gesture-bar inset. */
export function bottomNavHeight(): string {
  return `var(${BOTTOM_NAV_HEIGHT_VAR}, calc(${ONE_LINE_HEIGHT_PX}px + ${safeAreaInset('bottom')}))`
}

/** A ref callback for the bar's root element that publishes its height (see `publishSize`). */
export function publishBottomNavHeight(
  root?: HTMLElement,
): (element: HTMLElement | null) => void {
  return publishSize(BOTTOM_NAV_HEIGHT_VAR, 'height', root)
}

/** The custom property `NewReminderFab` writes its width to while it is on screen. */
const NEW_REMINDER_FAB_WIDTH_VAR = '--new-reminder-fab-width'

/** A ref callback for the New reminder button that publishes its width. */
export function publishNewReminderFabWidth(
  root?: HTMLElement,
): (element: HTMLElement | null) => void {
  return publishSize(NEW_REMINDER_FAB_WIDTH_VAR, 'width', root)
}

/**
 * CSS max-width for a start-aligned control at the end of a list under the floating
 * New reminder button, which keeps it out of the button's column: the column's width
 * less the button's measured width and an 8px gap. With no button on screen the whole
 * width is free. Pair it with `minWidth: 'min-content'`, so a word wider than what is
 * left still never breaks.
 */
export function besideNewReminderFab(): string {
  return `calc(100% - var(${NEW_REMINDER_FAB_WIDTH_VAR}, 0px) - 8px)`
}
