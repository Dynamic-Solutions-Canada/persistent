/** CSS safe-area spacing shared by the shell and floating controls. */
export function safeAreaInset(side: 'top' | 'bottom' | 'left' | 'right'): string {
  // Older Android WebViews report zero env() insets. Native supplies the measured
  // overlap; max preserves browser insets without adding the two together.
  return `max(env(safe-area-inset-${side}, 0px), var(--native-safe-area-inset-${side}, 0px))`
}
