export const DURATIONS = [60, 90, 120] as const
export type Duration = (typeof DURATIONS)[number]

// Muted student colours from the prototype
export const PALETTE = ['#0E8A5F', '#3F6FA8', '#8C6A3F', '#6A5D8F', '#3F7F7B', '#8E5A5A']

const NUM0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const NUM2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// HK$ 1,300 or HK$ 420.50
export function money(n: number | null | undefined) {
  const v = Number(n ?? 0)
  return 'HK$ ' + (v % 1 ? NUM2 : NUM0).format(v)
}

export function fmtDuration(min: number) {
  return min === 60 ? '1 hr' : `${min / 60} hrs`
}

export function fmtHours(min: number) {
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hr' : 'hrs'}`
}

export function initials(name: string | null | undefined) {
  return (name ?? '?')
    .split(/\s+/)
    .map((x) => x[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
