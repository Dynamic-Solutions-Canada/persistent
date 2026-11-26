import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
/**
 * Fixed bottom tab bar: switch between what's due now (Current), what's scheduled
 * (Upcoming), the notes kept to be read, history (past/done), and settings.
 * Mobile-first primary navigation.
 * Single-line labels stay compact; actual wrapping grows the row while keeping
 * icons aligned, without reserving an empty second line for every translation.
 * A label wraps only between words: a tab whose longest word does not fit its equal
 * share grows instead. The bar publishes its height (`lib/fixedControlSizes.ts`), so the
 * floating New reminder button and the page's bottom padding follow a taller bar.
 *
 * Order is chronological on purpose — now, next, past — so Upcoming sits between
 * Current and History, and Notes sits after them: it is the one tab with no place in
 * that sequence, since a note never happens. Keep `TAB_ROUTES` in
 * `native/useNativeBack.ts` in step: Android Back treats a tab root as a place it
 * falls back *to*, and a route missing from that list is treated as a child screen
 * instead.
 *
 * **Notes is conditional** — it appears only while the user has at least one note.
 * Five tabs is already the most a phone bar carries comfortably, and a note is opt-in:
 * most accounts have none, and a permanently empty tab would spend a fifth of the bar
 * advertising a feature rather than navigating to anything. The `/notes` route exists
 * regardless (see `pages/NotesPage.tsx`); this only decides whether to offer the way in.
 */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import type { SvgIconComponent } from '@mui/icons-material'
import Sheet from '@mui/joy/Sheet'
import { safeAreaInset } from '../lib/safeArea.js'
import { publishBottomNavHeight } from '../lib/fixedControlSizes.js'
import Stack from '@mui/joy/Stack'
import Button from '@mui/joy/Button'
import Typography from '@mui/joy/Typography'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import ScheduleIcon from '@mui/icons-material/Schedule'
import StickyNote2Icon from '@mui/icons-material/StickyNote2'
import HistoryIcon from '@mui/icons-material/History'
import SettingsIcon from '@mui/icons-material/Settings'
import { useReminders } from '../data/reminders.js'
import { isNote } from '../lib/notes.js'
import { useReceivedShares } from '../data/shares.js'

interface NavItem {
  to: string
  label: string
  icon: SvgIconComponent
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Current', icon: NotificationsActiveIcon },
  { to: '/upcoming', label: 'Upcoming', icon: ScheduleIcon },
  { to: '/notes', label: 'Notes', icon: StickyNote2Icon },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

/** An on-screen keyboard can only be up if something typeable has focus. */
function isEditableFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
  )
}

/**
 * True while the on-screen keyboard is up. The bar hides then, so the keyboard
 * doesn't push it up over the content.
 *
 * Height is compared against a running maximum rather than a fixed number, since
 * there is no portable way to ask how tall the viewport "should" be. That baseline
 * only ever grew, which is correct on a phone (the viewport has one full height)
 * and wrong everywhere else: **the Windows flyout can be dragged to resize**, and
 * its WebView is suspended and resumed rather than reloaded. Shrink the window by
 * more than the threshold, or catch one odd measurement while it is being sized,
 * and the bar was hidden for the life of the page with no keyboard anywhere near
 * it. That is the "no tab bar at the bottom" state, and it stuck because nothing
 * ever lowered the baseline.
 *
 * The focus check is what bounds it: with nothing typeable focused there is no
 * keyboard, so treat the current height as the new truth instead of evidence of
 * one. It stays a *guard* on the viewport measurement rather than replacing it,
 * because the original reason for measuring still holds — the keyboard can close
 * while the input keeps focus, and the bar has to come back for that too.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    let baseline = vv?.height ?? window.innerHeight
    const measure = () => {
      const h = vv?.height ?? window.innerHeight
      if (!isEditableFocused()) {
        // Re-baseline: this height is the window's real size, not a keyboard.
        baseline = h
        setOpen(false)
        return
      }
      baseline = Math.max(baseline, h)
      setOpen(baseline - h > 150)
    }
    measure()
    vv?.addEventListener('resize', measure)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    // Focus changes decide which branch above applies, so they have to re-measure
    // too — otherwise blurring an input leaves the bar hidden until the next resize.
    document.addEventListener('focusin', measure)
    document.addEventListener('focusout', measure)
    return () => {
      vv?.removeEventListener('resize', measure)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      document.removeEventListener('focusin', measure)
      document.removeEventListener('focusout', measure)
    }
  }, [])
  return open
}

/**
 * Whether the tab row must fall back to breaking words, with a callback ref for the row.
 *
 * Each tab is normally at least as wide as its longest word, so no label breaks
 * mid-word. When the words together are wider than the row (a window narrower than
 * any phone, or a large text size) that would push the last tab off screen, so the
 * row then returns to equal shares that may break a word: every tab stays reachable.
 *
 * The width the word-keeping row needed is recorded when it overflows, and the row
 * leaves the fallback only once it is that wide again, so the two layouts never
 * alternate. A new label set (another language, or the Notes tab coming or going)
 * measures again from the word-keeping layout.
 *
 * @param labels The current labels, joined; any change re-measures.
 */
function useWordBreakFallback(
  labels: string,
): [(element: HTMLDivElement | null) => void, boolean] {
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  // The row's scrollWidth when the word-keeping layout overflowed, or null while it fits.
  const [needed, setNeeded] = useState<number | null>(null)
  const [measuredLabels, setMeasuredLabels] = useState(labels)
  if (measuredLabels !== labels) {
    setMeasuredLabels(labels)
    setNeeded(null)
  }

  useLayoutEffect(() => {
    if (!row) return

    // Enter the fallback when the word-keeping row overflows; leave it when the row
    // is as wide as that layout needed.
    const check = () =>
      setNeeded((previous) => {
        if (previous === null) {
          return row.scrollWidth > row.clientWidth + 1 ? row.scrollWidth : null
        }
        return row.clientWidth >= previous ? null : previous
      })
    check()

    // A resize or a text-size change (which changes the row's height) checks again.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(row)
    return () => observer.disconnect()
  }, [row, labels, needed])

  return [setRow, needed !== null]
}

export function BottomNav() {
  useTranslation()
  const { pathname } = useLocation()
  const reminders = useReminders()
  const received = useReceivedShares()
  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)
  // One ref callback for the bar's life, so re-renders don't detach and re-measure it.
  const navRef = useMemo(() => publishBottomNavHeight(), [])

  // The Notes tab earns its place only when there is a note to show — but never
  // disappears from under the user while they are standing on it, which is what
  // deleting their last note would otherwise do.
  const hasNotes =
    (reminders.data ?? []).some(isNote) ||
    (received.data ?? []).some((share) => share.isNote)
  const items = ITEMS.filter(
    (item) => item.to !== '/notes' || hasNotes || isActive('/notes'),
  )
  const [rowRef, breakWords] = useWordBreakFallback(
    items.map((item) => tr(item.label)).join('\n'),
  )

  // Hide the bar while typing so the keyboard doesn't push it up over the content.
  const keyboardOpen = useKeyboardOpen()
  if (keyboardOpen) return null

  return (
    <Sheet
      ref={navRef}
      variant="solid"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        bgcolor: 'background.surface',
        borderTop: '1px solid',
        borderColor: 'divider',
        // Extend the bar's background down behind the gesture bar while keeping the
        // buttons above it — otherwise the tabs sit under the system navigation.
        pb: safeAreaInset('bottom'),
        pl: safeAreaInset('left'),
        pr: safeAreaInset('right'),
      }}
    >
      <Stack ref={rowRef} direction="row" sx={{ maxWidth: 640, mx: 'auto' }}>
        {items.map(({ to, label, icon: Icon }) => {
          const active = isActive(to)
          return (
            <Button
              key={to}
              component={RouterLink}
              to={to}
              variant={active ? 'soft' : 'plain'}
              color={active ? 'primary' : 'neutral'}
              // Tabs share the row equally (a zero basis) until a label's longest word
              // would not fit its share: `min-content` then widens that tab and the
              // others give up the room, so "Einstellungen" or "Configurações" stays one
              // word instead of breaking mid-word. A small inline padding keeps five
              // translated tabs within a 320px phone; below that, `breakWords` lets
              // them shrink rather than push a tab off screen.
              sx={{
                flex: '1 1 0',
                minWidth: breakWords ? 0 : 'min-content',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                gap: 0.25,
                py: 1,
                px: 0.5,
                borderRadius: 0,
              }}
            >
              <Icon fontSize="small" />
              <Typography
                level="body-xs"
                sx={{
                  color: 'inherit',
                  maxWidth: '100%',
                  lineHeight: 1.2,
                  textAlign: 'center',
                  // Lines break between words; a word breaks only in the fallback.
                  // Breaking anywhere by default split single long words at the last
                  // letter that fitted ("Einstellunge" / "n").
                  overflowWrap: breakWords ? 'anywhere' : 'normal',
                }}
              >
                {tr(label)}
              </Typography>
            </Button>
          )
        })}
      </Stack>
    </Sheet>
  )
}
