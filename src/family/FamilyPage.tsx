import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthProvider'
import UserMenu from '../auth/UserMenu'
import {
  WD_SHORT,
  dayOfMonth,
  deviceTz,
  fmtDayLong,
  fmtDayShort,
  fmtWeekRange,
  fromMin,
  isoAddDays,
  mondayOf,
  tzCity,
  weekdayOf,
  zonedParts,
  zonedToUtc,
} from '../lib/time'
import { rpcMessage } from '../lib/rpc'
import { Modal, useToast } from '../lib/ui'
import BookDialog, { type Prices } from './BookDialog'

const WEEKS_AHEAD = 11 // current week + 11 = 12 weeks
const LIST_SHORT = 6

type Own = { id: string; starts_at: string; ends_at: string; duration_min: number; series_id: string | null }
type Free = { starts_at: string; max_duration: number }
type Me = { student_name: string | null; price_60: number | null; price_90: number | null; price_120: number | null }

export default function FamilyPage() {
  const { profile } = useAuth()
  const tz = deviceTz()
  const today = zonedParts(new Date(), tz)
  const [view, setView] = useState<'book' | 'mine'>('book')
  const [week, setWeek] = useState(0)
  const [day, setDay] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [cancelHours, setCancelHours] = useState(24)
  const [own, setOwn] = useState<Own[] | null>(null)
  const [lastDuration, setLastDuration] = useState(60)
  const [free, setFree] = useState<Free[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [booking, setBooking] = useState<Free | null>(null)
  const [cancelling, setCancelling] = useState<Own | null>(null)
  const [showAll, setShowAll] = useState(false)

  const monday = isoAddDays(mondayOf(today.iso), 7 * week)
  const days = Array.from({ length: 7 }, (_, i) => isoAddDays(monday, i))

  const loadMine = useCallback(async () => {
    if (!profile) return
    const [meQ, info, ownQ, lastQ] = await Promise.all([
      supabase.from('profiles').select('student_name, price_60, price_90, price_120').eq('id', profile.id).single(),
      supabase.rpc('booking_info'),
      supabase
        .from('bookings')
        .select('id, starts_at, ends_at, duration_min, series_id')
        .eq('status', 'booked')
        .gt('ends_at', new Date().toISOString())
        .order('starts_at'),
      supabase.from('bookings').select('duration_min').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1),
    ])
    if (meQ.error || info.error || ownQ.error) {
      setLoadError(true)
      return
    }
    setLoadError(false)
    setMe(meQ.data as Me)
    setCancelHours((info.data as { cancel_hours: number }).cancel_hours)
    setOwn(ownQ.data as Own[])
    if (lastQ.data?.[0]) setLastDuration(lastQ.data[0].duration_min)
  }, [profile])

  const loadFree = useCallback(async () => {
    setFree(null)
    const { data, error } = await supabase.rpc('get_free_starts', {
      p_from: zonedToUtc(monday, 0, tz).toISOString(),
      p_to: zonedToUtc(isoAddDays(monday, 7), 0, tz).toISOString(),
    })
    if (error) {
      setLoadError(true)
      return
    }
    setFree(data as Free[])
  }, [monday, tz])

  useEffect(() => {
    loadMine()
  }, [loadMine])

  useEffect(() => {
    loadFree()
  }, [loadFree])

  function reloadAll() {
    loadMine()
    loadFree()
  }

  const local = (iso: string) => zonedParts(new Date(iso), tz)
  const freeOn = (iso: string) => (free ?? []).filter((f) => local(f.starts_at).iso === iso)
  const ownOn = (iso: string) => (own ?? []).filter((l) => local(l.starts_at).iso === iso)
  const timeRange = (l: Own) => `${fromMin(local(l.starts_at).min)}–${fromMin(local(l.ends_at).min)}`

  // Selected day: the chosen one if it's in this week, else the first day with free times
  const selected = day && days.includes(day) ? day : days.find((iso) => freeOn(iso).length > 0) ?? days.find((iso) => iso >= today.iso) ?? days[0]

  if (loadError) {
    return (
      <>
        <UserMenu />
        <div className="card placeholder">
          Could not load your lessons. Check your internet connection. <button className="btn sm" onClick={reloadAll}>Try again</button>
        </div>
      </>
    )
  }

  const prices: Prices = { 60: me?.price_60 ?? null, 90: me?.price_90 ?? null, 120: me?.price_120 ?? null }
  const firstName = (me?.student_name ?? profile?.student_name ?? '').split(' ')[0]
  const next = own?.[0]
  const lessons = own ?? []
  const shown = showAll ? lessons : lessons.slice(0, LIST_SHORT)

  return (
    <>
      <UserMenu />
      <header className="head fam">
        <h1>{firstName ? `Hi ${firstName}` : 'Tutoring with Mats'}</h1>
        <p className="small">
          Times in {tzCity(tz)} time · free cancellation up to {cancelHours} h before
        </p>
      </header>

      {next && (
        <div className="card nextcard">
          <div>
            <div className="k">Next lesson</div>
            <div className="v">
              {fmtDayShort(local(next.starts_at).iso)}, {timeRange(next)}
            </div>
          </div>
        </div>
      )}

      <div className="seg wide" role="tablist">
        <button role="tab" aria-selected={view === 'book'} className={view === 'book' ? 'on' : ''} onClick={() => setView('book')}>
          Book
        </button>
        <button role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>
          My lessons{lessons.length ? ` (${lessons.length})` : ''}
        </button>
      </div>

      {view === 'book' ? (
        <>
          <div className="wk weeknav">
            <button className="iconbtn" aria-label="Previous week" disabled={week <= 0} onClick={() => setWeek(week - 1)}>‹</button>
            <span className="wklabel">{fmtWeekRange(monday)}</span>
            <button className="iconbtn" aria-label="Next week" disabled={week >= WEEKS_AHEAD} onClick={() => setWeek(week + 1)}>›</button>
          </div>

          <div className="daystrip">
            {days.map((iso) => {
              const hasFree = freeOn(iso).length > 0
              const hasOwn = ownOn(iso).length > 0
              return (
                <button
                  key={iso}
                  className={'daypill' + (iso === selected ? ' on' : '') + (hasFree ? '' : ' empty')}
                  onClick={() => setDay(iso)}
                  aria-label={fmtDayLong(iso) + (hasFree ? ', free times' : '')}
                >
                  <span className="wd">{WD_SHORT[weekdayOf(iso)]}</span>
                  <span className="dm">{dayOfMonth(iso)}</span>
                  <span className={'dot' + (hasOwn ? ' own' : hasFree ? '' : ' none')} />
                </button>
              )
            })}
          </div>

          {free === null ? (
            <p className="muted">Loading …</p>
          ) : (
            <div className="daybox">
              <p className="daytitle">{fmtDayLong(selected)}</p>
              {ownOn(selected).map((l) => (
                <div key={l.id} className="mychip">
                  <b>{timeRange(l)}</b>
                  <span>Your lesson</span>
                </div>
              ))}
              {freeOn(selected).length > 0 ? (
                <div className="timegrid">
                  {freeOn(selected).map((f) => (
                    <button key={f.starts_at} className="chip" onClick={() => setBooking(f)}>
                      {fromMin(local(f.starts_at).min)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="none">No free times on this day.</p>
              )}
            </div>
          )}
        </>
      ) : lessons.length === 0 ? (
        <p className="none">No lessons booked yet.</p>
      ) : (
        <div className="card lessonlist">
          {shown.map((l) => {
            const canCancel = new Date(l.starts_at).getTime() - Date.now() > cancelHours * 3600_000
            return (
              <div key={l.id} className="rowitem">
                <div>
                  <div className="t">{fmtDayShort(local(l.starts_at).iso)}</div>
                  <div className="s">
                    {timeRange(l)}
                    {l.series_id && ' · weekly'}
                  </div>
                </div>
                {canCancel ? (
                  <button className="btn sm ghost" onClick={() => setCancelling(l)}>Cancel</button>
                ) : (
                  <span className="lock">Message Mats to cancel</span>
                )}
              </div>
            )
          })}
          {lessons.length > LIST_SHORT && (
            <button className="rowitem more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show less' : `Show all ${lessons.length}`}
            </button>
          )}
        </div>
      )}

      {booking && (
        <BookDialog
          start={new Date(booking.starts_at)}
          maxDuration={booking.max_duration}
          prices={prices}
          preferredDuration={lastDuration}
          tz={tz}
          onClose={() => setBooking(null)}
          onBooked={reloadAll}
        />
      )}

      {cancelling && (
        <CancelDialog lesson={cancelling} label={`${fmtDayShort(local(cancelling.starts_at).iso)}, ${timeRange(cancelling)}`} onClose={() => setCancelling(null)} onDone={reloadAll} />
      )}
    </>
  )
}

function CancelDialog({ lesson, label, onClose, onDone }: { lesson: Own; label: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function cancelOne() {
    setBusy(true)
    const { error } = await supabase.rpc('cancel_booking', { p_id: lesson.id })
    toast(error ? rpcMessage(error)! : 'Lesson cancelled')
    onDone()
    onClose()
  }

  async function cancelFollowing() {
    setBusy(true)
    const { data, error } = await supabase.rpc('end_series', { p_series_id: lesson.series_id, p_from: lesson.starts_at })
    if (error) toast(rpcMessage(error)!)
    else {
      const n = (data as { cancelled: number }).cancelled
      toast(`${n} ${n === 1 ? 'lesson' : 'lessons'} cancelled`)
    }
    onDone()
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h3>Cancel lesson?</h3>
      <p className="muted" style={{ margin: '0 0 18px' }}>{label}</p>
      <div className="actions stack">
        <button className="btn danger" disabled={busy} onClick={cancelOne}>
          {lesson.series_id ? 'Only this lesson' : 'Cancel lesson'}
        </button>
        {lesson.series_id && (
          <button className="btn danger" disabled={busy} onClick={cancelFollowing}>This and all following</button>
        )}
        <button className="btn ghost" onClick={onClose}>Back</button>
      </div>
    </Modal>
  )
}
