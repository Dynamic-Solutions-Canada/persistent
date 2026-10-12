/** Pure flyout geometry, following the Windows tray/cursor fallback and work-area clamp. */
export interface Rectangle { x: number; y: number; width: number; height: number }

/** Ignore the zero-position placeholder emitted by tray adapters without usable geometry. */
export function activationAnchor(bounds: Rectangle, point?: { x: number; y: number }): Rectangle | undefined {
  if (bounds.width > 0 && bounds.height > 0 && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return bounds
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.x !== 0 || point.y !== 0)) return { ...point, width: 1, height: 1 }
  return undefined
}

/** Infer a panel-side corner when Linux omits icon bounds, instead of opening by a stale cursor. */
export function panelCornerAnchor(bounds: Rectangle, area: Rectangle): Rectangle {
  const top = area.y - bounds.y
  const bottom = bounds.y + bounds.height - area.y - area.height
  const left = area.x - bounds.x
  const right = bounds.x + bounds.width - area.x - area.width
  const leftPanel = top <= 0 && bottom <= 0 && left > right
  return { x: leftPanel ? bounds.x : bounds.x + bounds.width - 1, y: top > bottom ? bounds.y : bounds.y + bounds.height - 1, width: 1, height: 1 }
}

/** Keep the whole flyout within a work area, including negative coordinates on secondary displays. */
export function openingPosition(area: Rectangle, window: { width: number; height: number }, placement: 'tray' | 'last' | 'center', anchor: Rectangle, saved?: { x: number; y: number }): { x: number; y: number } {
  let x = area.x + (area.width - window.width) / 2
  let y = area.y + (area.height - window.height) / 2
  if (placement === 'last' && saved) {
    x = saved.x
    y = saved.y
  } else if (placement === 'tray' || placement === 'last' && !saved) {
    // Windows tucks the flyout into the work-area corner nearest the tray,
    // rather than centering it under the icon. Leave the same 12-pixel inset.
    const right = anchor.x + anchor.width / 2 >= area.x + area.width / 2
    const bottom = anchor.y + anchor.height / 2 >= area.y + area.height / 2
    x = right ? area.x + area.width - window.width - 12 : area.x + 12
    y = bottom ? area.y + area.height - window.height - 12 : area.y + 12
  }
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - window.width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - window.height)))
  }
}
