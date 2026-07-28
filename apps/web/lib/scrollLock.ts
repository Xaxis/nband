let locks = 0
let saved = ''

/**
 * Reference-counted scroll lock.
 *
 * The search dialog and the hero overlay each saved and restored
 * document.body.style.overflow independently. Opening search over an expanded
 * hero captured 'hidden' as the value to restore, so closing both left the page
 * permanently unscrollable. Counting locks means the style is written once on
 * the way in and restored once on the way out.
 */
export function lockScroll(): () => void {
  if (locks === 0) {
    saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0) document.body.style.overflow = saved
  }
}
