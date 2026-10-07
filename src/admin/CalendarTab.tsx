import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PALETTE } from '../lib/format'
import {
  WD_SHORT,
  dayOfMonth,
  fmtDayLong,
  fmtWeekRange,
  isoAddDays,
  mondayOf,
  tzName,
  weekdayOf,
  zonedParts,
  zonedToUtc,
} from '../lib/time'
import { Modal, useToast } from '../lib/ui'
import TimeGrid, { type GridEvent } from './TimeGrid'
import { useAvailability, type Settings } from './availability'

type WeekBooking = {
  id: string
  family_id: string
  starts_at: string
  ends_at: string
  status: string
  paid: boolean
}

type FamilyLite = { id: string; student_name: string | null; color: string | null }

// A booking placed in the admin's time zone
type Placed = WeekBooking & { iso: string; start: number; end: number }

export default function CalendarTab({ settings }: { settings: Settings }) {
  const tz = settings.timezone
  const toast = useToast()
  const today = zonedParts(new Date(), tz)
  const [monday, setMonday] = useState(() => mondayOf(today.iso))
  const [edit, setEdit] = useState(false)
  const [menuIso, setMenuIso] = useState<string | null>(null)
  const sunday = isoAddDays(monday, 6)
  const { template, overrides, daySlots, saveOverride, error, reload } = useAvailability(monday, sunday)
  const [bookings, setBookings] = useState<Placed[]>([])
  const [families, setFamilies] = useState<Record<string, FamilyLite>>({})

  const loadBookings = useCallback(async () => {
    const from = zonedToUtc(monday, 0, tz).toISOString()
    const to = zonedToUtc(isoAddDays(monday, 7), 0, tz).toISOString()
    const [bk, fam] = await Promise.all([
      supabase.from('bookings').select('id, family_id, starts_at, ends_at, status, paid').neq('status', 'cancelled').gte('starts_at', from).lt('starts_at', to),
      supabase.from('profiles').select('id, student_name, color').eq('role', 'family'),
    ])
    if (bk.data) {
      setBookings(
        (bk.data as WeekBooking[]).map((b) => {
          const s = zonedParts(new Date(b.starts_at), tz)
          const e = zonedParts(new Date(b.ends_at), tz)
          return { ...b, iso: s.iso, start: s.min, end: e.iso === s.iso ? e.min : 1440 }
        }),
      )
    }
    if (fam.data) setFamilies(Object.fromEntries((fam.data as FamilyLite[]).map((f) => [f.id, f])))
  }, [monday, tz])

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

  async function commit(changes: Record<string, number[]>) {
    const results = await Promise.all(Object.entries(changes).map(([iso, slots]) => saveOverride(iso, slots)))
    if (!results.every(Boolean)) return toast('Could not save. Please try again.')
    // Blocking time never removes lessons that are already booked
    const hit = Object.entries(changes).some(([iso, slots]) =>
      bookings.some((b) => b.iso === iso && b.status === 'booked' && !rangeInside(b.start, b.end, slots)),
    )
    toast(hit ? 'Saved. Lessons already booked in this time stay booked.' : 'Saved')
  }

  function bookedOn(iso: string) {
    return bookings.filter((b) => b.iso === iso && b.status === 'booked').length
  }

  return (
    <>
      <div className="toolbar">
        <div className="wk">
          <button className="iconbtn" aria-label="Previous week" onClick={() => setMonday(isoAddDays(monday, -7))}>‹</button>
          <span className="wklabel">{fmtWeekRange(monday)}</span>
          <button className="iconbtn" aria-label="Next week" onClick={() => setMonday(isoAddDays(monday, 7))}>›</button>
        </div>
        <button className="btn sm" onClick={() => setMonday(mondayOf(today.iso))}>Today</button>
        <span className="grow" />
        {!edit && <button className="btn sm" onClick={() => setEdit(true)}>Edit hours</button>}
      </div>

      {edit ? (
        <div className="edithint">
          <p>Tap or drag across times to open or block them. Tap a day at the top to block it completely or reset it.</p>
          <button className="btn primary sm" onClick={() => setEdit(false)}>Done</button>
        </div>
      ) : (
        <p className="weeksum">All times are {tzName(tz)} time.</p>
      )}

      <TimeGrid
        edit={edit}
        onCommit={commit}
        columns={days.map((iso) => {
          const isToday = iso === today.iso
          const custom = iso in overrides
          return {
            key: iso,
            today: isToday,
            head: (
              <>
                <div className="dn">{WD_SHORT[weekdayOf(iso)]}</div>
                <span className="num">{dayOfMonth(iso)}</span>
                {custom && edit && <span className="cust">customised</span>}
              </>
            ),
            onHeadClick: () => setMenuIso(iso),
            slots: daySlots(iso),
            pastBefore: iso < today.iso ? 'all' : isToday ? today.min : undefined,
            nowMin: isToday ? today.min : undefined,
            events: bookings
              .filter((b) => b.iso === iso)
              .map<GridEvent>((b) => {
                const fam = families[b.family_id]
                return {
                  id: b.id,
                  start: b.start,
                  end: b.end,
                  color: fam?.color ?? PALETTE[0],
                  title: (fam?.student_name ?? 'Student').split(' ')[0],
                  late: b.status === 'late',
                }
              }),
          }
        })}
      />

      {menuIso && (
        <Modal onClose={() => setMenuIso(null)}>
          <h3>{fmtDayLong(menuIso)}</h3>
          {bookedOn(menuIso) > 0 && (
            <p className="muted small" style={{ margin: '0 0 14px' }}>
              {bookedOn(menuIso) === 1 ? '1 lesson is' : `${bookedOn(menuIso)} lessons are`} booked on this day. They stay booked.
            </p>
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
            <button className="btn ghost" onClick={() => setMenuIso(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}

function rangeInside(start: number, end: number, slots: number[]) {
  const set = new Set(slots)
  for (let m = start - (start % 30); m < end; m += 30) if (!set.has(m)) return false
  return true
}
