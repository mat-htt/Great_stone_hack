/** На ПК у горизонтальных лент нет свайпа: переводим колесо мыши в горизонтальную прокрутку
 *  и даём тянуть ленту мышью. Работает делегированием для всех .strip / .hscroll / .pages-strip. */
const SEL = '.strip, .hscroll, .pages-strip'

function edges(el: HTMLElement) {
  el.classList.toggle('can-l', el.scrollLeft > 4)
  el.classList.toggle('can-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
}

export function installHScroll() {
  window.addEventListener('wheel', (e) => {
    const el = (e.target as HTMLElement)?.closest?.(SEL) as HTMLElement | null
    if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    const before = el.scrollLeft
    el.scrollLeft += e.deltaY
    if (el.scrollLeft !== before) e.preventDefault()
  }, { passive: false })

  let drag: { el: HTMLElement; x: number; left: number; moved: boolean } | null = null
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = (e.target as HTMLElement)?.closest?.('.strip, .hscroll') as HTMLElement | null
    if (!el || el.scrollWidth <= el.clientWidth) return
    drag = { el, x: e.clientX, left: el.scrollLeft, moved: false }
  })
  window.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; drag.el.classList.add('grabbing'); drag.el.style.scrollSnapType = 'none' }
    if (drag.moved) drag.el.scrollLeft = drag.left - dx
  })
  const end = () => {
    if (!drag) return
    const d = drag; drag = null
    d.el.classList.remove('grabbing'); d.el.style.scrollSnapType = ''
    if (d.moved) {
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
      window.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 60)
    }
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)

  // подсказка-затухание по краям, если есть что листать
  document.addEventListener('scroll', (e) => { const el = e.target as HTMLElement; if (el?.matches?.(SEL)) edges(el) }, true)
  const scan = () => document.querySelectorAll<HTMLElement>(SEL).forEach(edges)
  new MutationObserver(() => requestAnimationFrame(scan)).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', scan)
}
