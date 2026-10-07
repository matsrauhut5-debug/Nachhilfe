import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthProvider'
import UserMenu from '../auth/UserMenu'
import { PALETTE, fmtDuration, initials } from '../lib/format'
import {
  MON_SHORT,
  WD_LONG,
  dayOfMonth,
  deviceTz,
  fmtDayLong,
  fmtDayShort,
  fmtWeekRange,
  fromMin,
  isoAddDays,
  monthIndex,
  mondayOf,
  tzCity,
  weekdayOf,
  zonedParts,
  zonedToUtc,
} from '../lib/time'
import { rpcMessage } from '../lib/rpc'
import { ConfirmDialog, useToast } from '../lib/ui'
import BookDialog, { type Prices } from './BookDialog'

const WEEKS_AHEAD = 11 // current week + 11 = 12 weeks

type Own = { id: string; starts_at: string; ends_at: string; duration_min: number; series_id: string | null }
type Free = { starts_at: string; max_duration: number }
type Me = { student_name: string | null; parent_name: string | null; color: string | null; price_60: number | null; price_90: number | null; price_120: number | null }

export default function FamilyPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const tz = deviceTz()
  const today = zonedParts(new Date(), tz)
  const [week, setWeek] = useState(0)
  const [me, setMe] = useState<Me | null>(null)
  const [cancelHours, setCancelHours] = useState(24)
  const [own, setOwn] = useState<Own[] | null>(null)
  const [lastDuration, setLastDuration] = useState(60)
  const [free, setFree] = useState<Free[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [booking, setBooking] = useState<Free | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'cancel'; lesson: Own } | { kind: 'series'; seriesId: string } | null>(null)

  const monday = isoAddDays(mondayOf(today.iso), 7 * week)

  const loadMine = useCallback(async () => {
    if (!profile) return
    const [meQ, info, ownQ, lastQ] = await Promise.all([
      supabase.from('profiles').select('student_name, parent_name, color, price_60, price_90, price_120').eq('id', profile.id).single(),
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
  const studentName = me?.student_name ?? profile?.student_name ?? ''
  const familyName = (me?.parent_name || studentName).trim().split(/\s+/).pop() ?? ''
  const canCancel = (l: Own) => new Date(l.starts_at).getTime() - Date.now() > cancelHours * 3600_000

  // Lessons and free starts grouped by the family's local date
  const days = Array.from({ length: 7 }, (_, i) => isoAddDays(monday, i))
  const ownByDay = (iso: string) => (own ?? []).filter((l) => zonedParts(new Date(l.starts_at), tz).iso === iso)
  const freeByDay = (iso: string) =>
    (free ?? []).filter((f) => zonedParts(new Date(f.starts_at), tz).iso === iso)
  const timeRange = (l: Own) => `${fromMin(zonedParts(new Date(l.starts_at), tz).min)}–${fromMin(zonedParts(new Date(l.ends_at), tz).min)}`

  const next = own?.[0]
  const visibleDays = days.filter((iso) => ownByDay(iso).length > 0 || freeByDay(iso).length > 0)

  // Series overview: one row per series with upcoming lessons
  const series = [...new Set((own ?? []).filter((l) => l.series_id).map((l) => l.series_id!))].map((id) => {
    const lessons = (own ?? []).filter((l) => l.series_id === id)
    return { id, first: lessons[0], last: lessons[lessons.length - 1], count: lessons.length }
  })

  return (
    <>
      <UserMenu />
      <header className="head">
        <h1>Tutoring with Mats</h1>
        <p>Tap a free time to book a lesson.</p>
        {studentName && (
          <div className="who" style={{ '--c': me?.color ?? PALETTE[0] } as CSSProperties}>
            <span className="av">{initials(studentName)}</span>
            Family {familyName} · {studentName.split(' ')[0]}
          </div>
        )}
        <p className="small" style={{ marginTop: 10 }}>All times are in your local time ({tzCity(tz)}).</p>
      </header>

      {next && (
        <div className="card nextcard">
          <div>
            <div className="k">Your next lesson</div>
            <div className="v">
              {fmtDayLong(zonedParts(new Date(next.starts_at), tz).iso)}, {timeRange(next)}
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="wk">
          <button className="iconbtn" aria-label="Previous week" disabled={week <= 0} onClick={() => setWeek(week - 1)}>‹</button>
          <span className="wklabel">{fmtWeekRange(monday)}</span>
          <button className="iconbtn" aria-label="Next week" disabled={week >= WEEKS_AHEAD} onClick={() => setWeek(week + 1)}>›</button>
        </div>
      </div>

      {free === null || own === null ? (
        <p className="muted">Loading free times …</p>
      ) : visibleDays.length === 0 ? (
        <p className="none">Nothing is free this week, sorry. Have a look at the next week.</p>
      ) : (
        <div className="sgrid">
          {visibleDays.map((iso) => {
            const isToday = iso === today.iso
            return (
              <div key={iso} className={'sday' + (isToday ? ' today' : '')}>
                <div className="dn">{WD_LONG[weekdayOf(iso)]}</div>
                <div className="dd">
                  {dayOfMonth(iso)} {MON_SHORT[monthIndex(iso)]}
                  {isToday && ' · today'}
                </div>
                {ownByDay(iso).map((l) => (
                  <div key={l.id} className="mychip">
                    <b>{timeRange(l)}</b>
                    <span>Your lesson{l.series_id ? ' · every week' : ''}</span>
                  </div>
                ))}
                {freeByDay(iso).length > 0 && (
                  <div className="chips">
                    {freeByDay(iso).map((f) => {
                      const t = fromMin(zonedParts(new Date(f.starts_at), tz).min)
                      return (
                        <button key={f.starts_at} className="chip" aria-label={`Book ${fmtDayLong(iso)} at ${t}`} onClick={() => setBooking(f)}>
                          {t}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <section className="sect">
        <h2>My lessons</h2>
        {!own || own.length === 0 ? (
          <p className="none">No lessons booked yet.</p>
        ) : (
          <>
            {series.map((s) => {
              const first = zonedParts(new Date(s.first.starts_at), tz)
              const last = zonedParts(new Date(s.last.starts_at), tz)
              return (
                <div key={s.id} className="card series">
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      Every {WD_LONG[weekdayOf(first.iso)]}, {timeRange(s.first)}
                    </div>
                    <div className="muted small">
                      {s.count} more {s.count === 1 ? 'lesson' : 'lessons'} until {dayOfMonth(last.iso)} {MON_SHORT[monthIndex(last.iso)]}
                    </div>
                  </div>
                  <button className="btn sm danger" onClick={() => setConfirm({ kind: 'series', seriesId: s.id })}>End series</button>
                </div>
              )
            })}
            <div className="card">
              {own.slice(0, 12).map((l) => (
                <div key={l.id} className="rowitem">
                  <div>
                    <div className="t">{fmtDayLong(zonedParts(new Date(l.starts_at), tz).iso)}</div>
                    <div className="s">
                      {timeRange(l)} · {fmtDuration(l.duration_min)}
                    </div>
                  </div>
                  {canCancel(l) ? (
                    <button className="btn sm" onClick={() => setConfirm({ kind: 'cancel', lesson: l })}>Cancel</button>
                  ) : (
                    <div className="lock">Too late to cancel online. Please message Mats directly.</div>
                  )}
                </div>
              ))}
              {own.length > 12 && (
                <div className="rowitem">
                  <div className="s">+ {own.length - 12} more lessons</div>
                </div>
              )}
            </div>
          </>
        )}
        <p className="fine" style={{ marginTop: 12 }}>
          Cancelling is free until {cancelHours} hours before the lesson, for example for holidays.
        </p>
      </section>

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

      {confirm?.kind === 'cancel' && (
        <ConfirmDialog
          title="Cancel this lesson?"
          text={`${fmtDayShort(zonedParts(new Date(confirm.lesson.starts_at), tz).iso)}, ${timeRange(confirm.lesson)}. Mats gets an email.`}
          okLabel="Cancel lesson"
          danger
          onOk={async () => {
            const { error } = await supabase.rpc('cancel_booking', { p_id: confirm.lesson.id })
            toast(error ? rpcMessage(error)! : 'Lesson cancelled')
            reloadAll()
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'series' && (
        <ConfirmDialog
          title="End this series?"
          text={`All future lessons of this series are cancelled. Lessons in the next ${cancelHours} hours stay booked.`}
          okLabel="End series"
          danger
          onOk={async () => {
            const { data, error } = await supabase.rpc('end_series', { p_series_id: confirm.seriesId })
            if (error) {
              toast(rpcMessage(error)!)
            } else {
              const r = data as { cancelled: number; kept: number }
              toast(
                `${r.cancelled} ${r.cancelled === 1 ? 'lesson' : 'lessons'} cancelled` +
                  (r.kept ? `, ${r.kept} too soon to cancel online` : ''),
              )
            }
            reloadAll()
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}
