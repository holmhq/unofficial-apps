// A project's mark: its logo, or its icon (or initial) on its colour. The
// icons are Lucide's, vendored; api/projects.js keeps the same names.
import { el } from './lib.js'
import { ICONS } from '../vendor/lucide/icons.js'

export const ICON_NAMES = Object.keys(ICONS)

export function icon(name, className = 'lucide') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)
  // Vendored markup, never anything a person typed.
  svg.innerHTML = ICONS[name] || ''
  return svg
}

// `base` is the box's class in each view; a logo adds `logoClass`.
export function mark(project, base, logoClass = 'has-logo', attrs = {}) {
  if (project.logo) return el('span', { ...attrs, class: `${base} ${logoClass}` }, el('img', { src: project.logo, alt: '' }))
  return el('span', { 'aria-hidden': 'true', ...attrs, class: base },
    ICONS[project.icon] ? icon(project.icon) : (project.name || '').trim().charAt(0).toUpperCase() || '?')
}
