// Date/time helpers. Calendar dates are ISO strings ("2026-10-12") and are
// computed in UTC so the device's own time zone never shifts them.
// Times of day are minutes since midnight (15:30 = 930).

export const SLOT = 30

export const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Monday first, as weekday numbers (0 = Sunday)
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

export function isoAddDays(iso: string, n: number) {
  const { y, m, d } = parts(iso)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function weekdayOf(iso: string) {
  const { y, m, d } = parts(iso)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function mondayOf(iso: string) {
  const wd = weekdayOf(iso)
  return isoAddDays(iso, wd === 0 ? -6 : 1 - wd)
}

export function dayOfMonth(iso: string) {
  return parts(iso).d
}

export function monthIndex(iso: string) {
  return parts(iso).m - 1
}

export function fromMin(m: number) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h < 10 ? '0' : ''}${h}:${mm < 10 ? '0' : ''}${mm}`
}

// "Mon 12 Oct"
export function fmtDayShort(iso: string) {
  return `${WD_SHORT[weekdayOf(iso)]} ${dayOfMonth(iso)} ${MON_SHORT[monthIndex(iso)]}`
}

// "Monday, 12 October"
export function fmtDayLong(iso: string) {
  return `${WD_LONG[weekdayOf(iso)]}, ${dayOfMonth(iso)} ${MON_LONG[monthIndex(iso)]}`
}

// "12 Oct – 18 Oct"
export function fmtWeekRange(monday: string) {
  const sun = isoAddDays(monday, 6)
  return `${dayOfMonth(monday)} ${MON_SHORT[monthIndex(monday)]} – ${dayOfMonth(sun)} ${MON_SHORT[monthIndex(sun)]}`
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

// Calendar date and minute of an instant, as seen in time zone `tz`
export function zonedParts(date: Date, tz: string): { iso: string; min: number } {
  let f = partFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    partFormatters.set(tz, f)
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return { iso: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }
}

// The instant at which the clock in `tz` shows `iso` + `min`
export function zonedToUtc(iso: string, min: number, tz: string): Date {
  const { y, m, d } = parts(iso)
  const wanted = Date.UTC(y, m - 1, d, 0, min)
  let guess = wanted
  for (let i = 0; i < 3; i++) {
    const seen = zonedParts(new Date(guess), tz)
    const sp = parts(seen.iso)
    const diff = Date.UTC(sp.y, sp.m - 1, sp.d, 0, seen.min) - wanted
    if (diff === 0) break
    guess -= diff
  }
  return new Date(guess)
}

/* ---------- Slots and windows ---------- */

export type Window = [number, number]

export function toWindows(slots: Iterable<number>): Window[] {
  const sorted = [...new Set(slots)].sort((a, b) => a - b)
  const out: Window[] = []
  for (const m of sorted) {
    const last = out[out.length - 1]
    if (last && last[1] === m) last[1] = m + SLOT
    else out.push([m, m + SLOT])
  }
  return out
}

export function toSlots(windows: Window[]): number[] {
  const out: number[] = []
  for (const [s, e] of windows) for (let m = s; m < e; m += SLOT) out.push(m)
  return out
}

export function sameSlots(a: number[], b: number[]) {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

const TZ_NAMES: Record<string, string> = {
  'Europe/Berlin': 'German',
  'Asia/Hong_Kong': 'Hong Kong',
  'Asia/Shanghai': 'China',
  'Asia/Singapore': 'Singapore',
  'Europe/London': 'UK',
}

// "German", "Hong Kong", … for texts like "All times are German time"
export function tzName(tz: string) {
  return TZ_NAMES[tz] ?? tz.split('/').pop()!.replace(/_/g, ' ')
}
