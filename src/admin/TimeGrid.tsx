import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SLOT, fromMin, toWindows } from '../lib/time'

export type GridColumn = {
  key: string
  head: ReactNode
  onHeadClick?: () => void // only used in edit mode
  slots: number[]
  today?: boolean
  // cells starting before this minute are in the past and locked ('all' = whole day)
  pastBefore?: number | 'all'
  nowMin?: number // red "now" line
  events?: GridEvent[]
}

export type GridEvent = {
  id: string
  start: number
  end: number
  color: string
  title: string
  sub?: ReactNode
  late?: boolean
  onClick?: () => void
}

const PPM = 1.1 // pixels per minute
const EDIT_LO = 7 * 60
const EDIT_HI = 22 * 60

type Paint = {
  on: boolean
  draft: Record<string, Set<number>>
  changed: Set<string>
  last: { key: string; m: number } | null
  locked: Record<string, Set<number>> // past cells per column
}

export default function TimeGrid(props: {
  columns: GridColumn[]
  edit: boolean
  onCommit?: (changes: Record<string, number[]>) => void
}) {
  const { columns, edit } = props
  const [draft, setDraft] = useState<Record<string, Set<number>> | null>(null)
  const paint = useRef<Paint | null>(null)
  const onCommit = useRef(props.onCommit)
  onCommit.current = props.onCommit

  // Visible range: fixed 07–22 when editing, otherwise fitted to hours and lessons
  let lo = edit ? EDIT_LO : 1440
  let hi = edit ? EDIT_HI : 0
  for (const c of columns) {
    for (const m of c.slots) {
      lo = Math.min(lo, m)
      hi = Math.max(hi, m + SLOT)
    }
    for (const e of c.events ?? []) {
      lo = Math.min(lo, e.start)
      hi = Math.max(hi, e.end)
    }
  }
  if (lo >= hi) {
    lo = 8 * 60
    hi = 18 * 60
  }
  if (!edit) {
    lo = Math.max(0, Math.floor(lo / 60) * 60 - 60)
    hi = Math.min(1440, Math.ceil(hi / 60) * 60 + 60)
  }

  const hours: number[] = []
  for (let t = lo + 60 - (lo % 60); t < hi; t += 60) hours.push(t)
  const cells: number[] = []
  for (let m = lo; m < hi; m += SLOT) cells.push(m)

  function isPast(c: GridColumn, m: number) {
    return c.pastBefore === 'all' || (typeof c.pastBefore === 'number' && m < c.pastBefore)
  }

  function apply(el: Element | null) {
    const p = paint.current
    const cell = el?.closest<HTMLElement>('.cell')
    // past cells are skipped via p.locked, so a drag ending on one still fills the cells before it
    if (!p || !cell) return
    const key = cell.dataset.key!
    const m = Number(cell.dataset.m)
    // Fast drags skip cells between two pointer events: fill the gap in the same column
    const from = p.last?.key === key ? p.last.m : m
    p.last = { key, m }
    const set = p.draft[key]
    let changed = false
    for (let x = Math.min(from, m); x <= Math.max(from, m); x += SLOT) {
      if (p.locked[key].has(x) || set.has(x) === p.on) continue
      if (p.on) set.add(x)
      else set.delete(x)
      changed = true
    }
    if (!changed) return
    p.changed.add(key)
    setDraft({ ...p.draft })
  }

  function start(e: React.PointerEvent) {
    const cell = (e.target as Element).closest<HTMLElement>('.cell')
    if (!edit || !cell || cell.classList.contains('past')) return
    e.preventDefault()
    const base = Object.fromEntries(columns.map((c) => [c.key, new Set(c.slots)]))
    const locked = Object.fromEntries(columns.map((c) => [c.key, new Set(cells.filter((m) => isPast(c, m)))]))
    paint.current = { on: !base[cell.dataset.key!].has(Number(cell.dataset.m)), draft: base, changed: new Set(), last: null, locked }
    apply(cell)
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (paint.current) apply(document.elementFromPoint(e.clientX, e.clientY))
    }
    function end() {
      const p = paint.current
      if (!p) return
      paint.current = null
      if (p.changed.size) {
        onCommit.current?.(Object.fromEntries([...p.changed].map((k) => [k, [...p.draft[k]].sort((a, b) => a - b)])))
      }
      setDraft(null)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
    }
  }, [])


  const style = { '--h': `${Math.round((hi - lo) * PPM)}px`, '--hr': `${60 * PPM}px`, '--cell': `${SLOT * PPM}px` } as CSSProperties

  return (
    <div className="tg-scroll">
      <div className={'tg' + (edit ? ' edit' : '')} style={style}>
        <div className="tg-head">
          <div />
          {columns.map((c) =>
            edit && c.onHeadClick && c.pastBefore !== 'all' ? (
              <div key={c.key} className={c.today ? 'today' : ''} style={{ padding: 0 }}>
                <button className="dh" onClick={c.onHeadClick}>{c.head}</button>
              </div>
            ) : (
              <div key={c.key} className={c.today ? 'today' : ''}>{c.head}</div>
            ),
          )}
        </div>
        <div className="tg-body" onPointerDown={start}>
          <div className="tg-times">
            {hours.map((t) => (
              <span key={t} className="hl" style={{ top: (t - lo) * PPM }}>{fromMin(t)}</span>
            ))}
          </div>
          {columns.map((c) => {
            const slots = draft?.[c.key] ?? new Set(c.slots)
            return (
              <div key={c.key} className="tg-col">
                {edit
                  ? cells.map((m) => (
                      <div
                        key={m}
                        className={'cell' + (slots.has(m) ? ' on' : '') + (isPast(c, m) ? ' past' : '')}
                        data-key={c.key}
                        data-m={m}
                      />
                    ))
                  : toWindows(slots).map(([s, e]) => (
                      <div key={s} className="band" style={{ top: (s - lo) * PPM, height: (e - s) * PPM }} />
                    ))}
                {(c.events ?? []).map((ev) => (
                  <button
                    key={ev.id}
                    className={'ev' + (ev.late ? ' late' : '')}
                    style={{ '--c': ev.color, top: (ev.start - lo) * PPM, height: Math.max(22, (ev.end - ev.start) * PPM - 2) } as CSSProperties}
                    tabIndex={edit ? -1 : undefined}
                    onClick={ev.onClick}
                  >
                    <b>{ev.title}</b>
                    {fromMin(ev.start)}–{fromMin(ev.end)}
                    {ev.sub && !edit && <><br />{ev.sub}</>}
                  </button>
                ))}
                {c.nowMin !== undefined && c.nowMin > lo && c.nowMin < hi && (
                  <div className="nowline" style={{ top: (c.nowMin - lo) * PPM }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
