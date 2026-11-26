/**
 * An element's measured size, published as a CSS custom property on the root element.
 *
 * Fixed controls (the bottom tab bar, the floating New reminder button) change size
 * with their translated labels and the gesture-bar inset. What has to clear them reads
 * the property with a fallback, instead of assuming the English one-line size.
 */

/**
 * A callback ref that keeps `variable` equal to the attached element's border-box
 * `dimension` in px, through every resize. Detaching it (the element unmounts) removes
 * the property, so readers fall back to their default rather than a stale value.
 *
 * Create it once per element (for example with `useMemo`): each call returns a new
 * callback, and a new callback on every render would detach and re-measure each time.
 *
 * @param variable The custom property to write, such as `--bottom-nav-height`.
 * @param dimension Which side of the element's bounding box to publish.
 * @param root The element that carries the property; the document root by default.
 * @returns A ref callback to pass to the element's `ref`.
 */
export function publishSize(
  variable: string,
  dimension: 'width' | 'height',
  root: HTMLElement = document.documentElement,
): (element: HTMLElement | null) => void {
  let observer: ResizeObserver | null = null

  return (element) => {
    // A new element (or none) replaces whatever was observed before.
    observer?.disconnect()
    observer = null

    if (!element) {
      root.style.removeProperty(variable)
      return
    }

    const publish = () => {
      const size = element.getBoundingClientRect()[dimension]
      root.style.setProperty(variable, `${size}px`)
    }
    publish()

    // Environments without ResizeObserver (old WebViews, tests) keep the first value.
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(publish)
      observer.observe(element)
    }
  }
}
