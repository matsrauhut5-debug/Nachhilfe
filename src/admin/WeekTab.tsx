import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../supabase'
import { PALETTE, fmtHours, money } from '../lib/format'
import {
  MON_LONG,
  WD_SHORT,
  dayOfMonth,
  fmtDayLong,
  fmtDayShort,
  fmtOffset,
  fmtWeekRange,
  fromMin,
  isoAddDays,
  mondayOf,
  monthIndex,
  toWindows,
  tzName,
  tzOffsetMin,
  tzShort,
  weekdayOf,
  zonedParts,
  zonedToUtc,
} from '../lib/time'
import { Modal, useToast } from '../lib/ui'
import TimeGrid, { type GridEvent } from './TimeGrid'
import { useAvailability, type Settings } from './availability'
import { BOOKING_COLS, firstName, place, useFamilies, type Booking, type Placed } from './data'
import { AddLessonDialog, LessonDialog } from './LessonDialogs'

export default function WeekTab({ settings }: { settings: Settings }) {
  const tz = settings.timezone
  const toast = useToast()
  const today = zonedParts(new Date(), tz)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [monday, setMonday] = useState(() => mondayOf(today.iso))
  const [month, setMonth] = useState(() => today.iso.slice(0, 8) + '01')
  const [edit, setEdit] = useState(false)
  const [menuIso, setMenuIso] = useState<string | null>(null)
  const [open, setOpen] = useState<Placed | null>(null)
  const [adding, setAdding] = useState(false)
  const [bookings, setBookings] = useState<Placed[]>([])
  const families = useFamilies()

  // Range shown: one week, or the 6-week block around a month
  const rangeStart = mode === 'week' ? monday : mondayOf(month)
  const rangeDays = mode === 'week' ? 7 : 42
  const rangeEnd = isoAddDays(rangeStart, rangeDays - 1)
  const { template, overrides, daySlots, saveOverride, error, reload } = useAvailability(rangeStart, rangeEnd)

  const loadBookings = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select(BOOKING_COLS)
      .neq('status', 'cancelled')
      .gte('starts_at', zonedToUtc(rangeStart, 0, tz).toISOString())
      .lt('starts_at', zonedToUtc(isoAddDays(rangeStart, rangeDays), 0, tz).toISOString())
      .order('starts_at')
    if (data) setBookings((data as Booking[]).map((b) => place(b, tz)))
  }, [rangeStart, rangeDays, tz])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  if (error) {
    return (
      <div className="card placeholder">
        Could not load the calendar. <button className="btn sm" onClick={reload}>Try again</button>
      </div>
    )
  }
  if (!template) return <p className="muted">Loading …</p>

  const days = Array.from({ length: 7 }, (_, i) => isoAddDays(monday, i))
  const on = (iso: string) => bookings.filter((b) => b.iso === iso)
  const weekLessons = bookings.filter((b) => b.iso >= monday && b.iso <= days[6])
  const second = settings.second_timezone
  const offset = tzOffsetMin(zonedToUtc(monday, 720, tz), tz, second)
  const offsetEnd = tzOffsetMin(zonedToUtc(days[6], 720, tz), tz, second)

  async function commit(changes: Record<string, number[]>) {
    const results = await Promise.all(Object.entries(changes).map(([iso, slots]) => saveOverride(iso, slots)))
    if (!results.every(Boolean)) return toast('Could not save. Please try again.')
    const hit = Object.entries(changes).some(([iso, slots]) =>
      on(iso).some((b) => b.status === 'booked' && !inside(b.start, b.end, slots)),
    )
    toast(hit ? 'Saved. Lessons already booked in this time stay booked.' : 'Saved')
  }

  function goToday() {
    setMonday(mondayOf(today.iso))
    setMonth(today.iso.slice(0, 8) + '01')
  }

  function step(dir: number) {
    if (mode === 'week') setMonday(isoAddDays(monday, 7 * dir))
    else {
      const [y, m] = month.split('-').map(Number)
      const d = new Date(Date.UTC(y, m - 1 + dir, 1))
      setMonth(d.toISOString().slice(0, 10))
    }
  }

  const label = mode === 'week' ? fmtWeekRange(monday) : `${MON_LONG[monthIndex(month)]} ${month.slice(0, 4)}`
  const events = (iso: string) =>
    on(iso).map<GridEvent>((b) => {
      const f = families[b.family_id]
      const past = new Date(b.ends_at).getTime() < Date.now()
      return {
        id: b.id,
        start: b.start,
        end: b.end,
        color: f?.color ?? PALETTE[0],
        title: firstName(f),
        late: b.status === 'late',
        sub: b.paid ? <span className="pd">paid</span> : past || b.status === 'late' ? <span className="op">open</span> : undefined,
        onClick: () => setOpen(b),
      }
    })

  return (
    <>
      <div className="toolbar">
        <div className="wk">
          <button className="iconbtn" aria-label="Back" onClick={() => step(-1)}>‹</button>
          <span className="wklabel">{label}</span>
          <button className="iconbtn" aria-label="Forward" onClick={() => step(1)}>›</button>
        </div>
        <button className="btn sm ghost" onClick={goToday}>Today</button>
        <span className="grow" />
        {!edit && (
          <div className="seg">
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Week</button>
            <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Month</button>
          </div>
        )}
      </div>

      {mode === 'week' && (
        <>
          {edit ? (
            <div className="edithint">
              <p>Tap or drag to open or block times for this week. Tap a day at the top to block it or reset it.</p>
              <button className="btn primary sm" onClick={() => setEdit(false)}>Done</button>
            </div>
          ) : (
            <div className="weekbar">
              <span className="stat">
                <b>{weekLessons.length}</b> {weekLessons.length === 1 ? 'lesson' : 'lessons'} ·{' '}
                <b>{fmtHours(weekLessons.reduce((s, b) => s + b.duration_min, 0))}</b> ·{' '}
                <b>{money(weekLessons.reduce((s, b) => s + Number(b.price), 0))}</b>
              </span>
              <span className="grow" />
              <button className="btn sm" onClick={() => setEdit(true)}>Edit hours</button>
              <button className="btn primary sm" onClick={() => setAdding(true)}>+ Lesson</button>
            </div>
          )}

          <div className={edit ? '' : 'only-wide'}>
            <TimeGrid
              edit={edit}
              onCommit={commit}
              mainLabel={tzShort(tz)}
              second={{ label: tzShort(second), offsetMin: offset }}
              columns={days.map((iso) => {
                const isToday = iso === today.iso
                return {
                  key: iso,
                  today: isToday,
                  head: (
                    <>
                      <div className="dn">{WD_SHORT[weekdayOf(iso)]}</div>
                      <span className="num">{dayOfMonth(iso)}</span>
                      {iso in overrides && <span className="cust">customised</span>}
                    </>
                  ),
                  onHeadClick: () => setMenuIso(iso),
                  slots: daySlots(iso),
                  usual: template[weekdayOf(iso)],
                  pastBefore: iso < today.iso ? 'all' : isToday ? today.min : undefined,
                  nowMin: isToday ? today.min : undefined,
                  events: events(iso),
                }
              })}
            />
          </div>

          {!edit && (
            <div className="only-narrow agenda">
              {days.map((iso) => {
                const lessons = on(iso)
                const busy = new Set<number>()
                lessons.forEach((b) => {
                  for (let m = b.start - (b.start % 30); m < b.end; m += 30) busy.add(m)
                })
                const freeWins = toWindows(daySlots(iso).filter((m) => !busy.has(m) && (iso > today.iso || (iso === today.iso && m >= today.min))))
                if (iso < today.iso && lessons.length === 0) return null
                return (
                  <div key={iso} className={'aday' + (iso === today.iso ? ' today' : '')}>
                    <button className="aday-head" onClick={() => setMenuIso(iso)}>
                      <span>{fmtDayShort(iso)}{iso === today.iso && ' · today'}</span>
                      {iso in overrides && <span className="cust">customised</span>}
                    </button>
                    {lessons.map((b) => {
                      const f = families[b.family_id]
                      const past = new Date(b.ends_at).getTime() < Date.now()
                      return (
                        <button key={b.id} className={'alesson' + (b.status === 'late' ? ' late' : '')} style={{ '--c': f?.color ?? PALETTE[0] } as CSSProperties} onClick={() => setOpen(b)}>
                          <span className="t">{fromMin(b.start)}–{fromMin(b.end % 1440)}</span>
                          <span className="n">{f?.student_name ?? 'Student'}</span>
                          {b.paid ? <span className="pd">paid</span> : past || b.status === 'late' ? <span className="op">open</span> : null}
                        </button>
                      )
                    })}
                    {freeWins.length > 0 && (
                      <p className="afree">Free {freeWins.map(([s, e]) => `${fromMin(s)}–${fromMin(e)}`).join(' · ')}</p>
                    )}
                    {lessons.length === 0 && freeWins.length === 0 && <p className="afree">–</p>}
                  </div>
                )
              })}
            </div>
          )}

          <div className="legend">
            <span><i className="lg usual" />Usual hours</span>
            <span><i className="lg extra" />Extra hours</span>
            <span className="tzinfo">
              {tzName(tz)} time · <b>{tzShort(second)} {fmtOffset(offset)}</b>
              {offsetEnd !== offset && ` (from Sunday ${fmtOffset(offsetEnd)})`}
            </span>
          </div>
        </>
      )}

      {mode === 'month' && (
        <div className="mgrid">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => <div key={wd} className="mh">{WD_SHORT[wd]}</div>)}
          {Array.from({ length: 42 }, (_, i) => isoAddDays(rangeStart, i)).map((iso) => {
            const list = on(iso)
            const blocked = daySlots(iso).length === 0 && template[weekdayOf(iso)].length > 0
            return (
              <button
                key={iso}
                className={'mcell' + (iso.slice(0, 7) !== month.slice(0, 7) ? ' out' : '') + (iso === today.iso ? ' today' : '') + (blocked ? ' blocked' : '')}
                onClick={() => {
                  setMonday(mondayOf(iso))
                  setMode('week')
                }}
                aria-label={`${fmtDayLong(iso)}, ${list.length} lessons`}
              >
                <span className="n">{dayOfMonth(iso)}</span>
                {list.slice(0, 3).map((b) => (
                  <span key={b.id} className={'me' + (b.status === 'late' ? ' late' : '')} style={{ '--c': families[b.family_id]?.color ?? PALETTE[0] } as CSSProperties}>
                    <i />
                    {fromMin(b.start)} <span>{firstName(families[b.family_id])}</span>
                  </span>
                ))}
                {list.length > 3 && <span className="me muted">+{list.length - 3} more</span>}
              </button>
            )
          })}
        </div>
      )}

      {menuIso && (
        <Modal onClose={() => setMenuIso(null)}>
          <h3>{fmtDayLong(menuIso)}</h3>
          {on(menuIso).some((b) => b.status === 'booked') && (
            <p className="muted small" style={{ margin: '0 0 14px' }}>Lessons already booked on this day stay booked.</p>
          )}
          <div className="actions stack">
            <button
              className="btn danger"
              disabled={daySlots(menuIso).length === 0}
              onClick={async () => {
                const iso = menuIso
                setMenuIso(null)
                toast((await saveOverride(iso, [])) ? 'Day blocked' : 'Could not save. Please try again.')
              }}
            >
              Block whole day
            </button>
            {menuIso in overrides && (
              <button
                className="btn"
                onClick={async () => {
                  const iso = menuIso
                  setMenuIso(null)
                  toast((await saveOverride(iso, null)) ? 'Usual hours restored' : 'Could not save. Please try again.')
                }}
              >
                Reset to usual hours
              </button>
            )}
            {!edit && (
              <button
                className="btn"
                onClick={() => {
                  setMenuIso(null)
                  setEdit(true)
                }}
              >
                Edit hours of this week
              </button>
            )}
            <button className="btn ghost" onClick={() => setMenuIso(null)}>Close</button>
          </div>
        </Modal>
      )}

      {open && (
        <LessonDialog
          lesson={open}
          family={families[open.family_id]}
          tz={tz}
          secondTz={second}
          onClose={() => setOpen(null)}
          onChanged={loadBookings}
        />
      )}

      {adding && (
        <AddLessonDialog
          families={Object.values(families)}
          tz={tz}
          defaultIso={monday > today.iso ? monday : today.iso}
          onClose={() => setAdding(false)}
          onBooked={loadBookings}
        />
      )}
    </>
  )
}

function inside(start: number, end: number, slots: number[]) {
  const set = new Set(slots)
  for (let m = start - (start % 30); m < end; m += 30) if (!set.has(m)) return false
  return true
}
