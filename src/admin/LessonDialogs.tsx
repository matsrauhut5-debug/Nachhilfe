import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../supabase'
import { DURATIONS, PALETTE, fmtDuration, money } from '../lib/format'
import { fmtDayShort, fromMin, isoAddDays, tzShort, zonedParts, zonedToUtc } from '../lib/time'
import { rpcMessage } from '../lib/rpc'
import { Modal, useToast } from '../lib/ui'
import type { FamilyLite, Placed } from './data'

/* ---------- Lesson details ---------- */

export function LessonDialog(props: {
  lesson: Placed
  family: FamilyLite | undefined
  tz: string
  secondTz: string
  onClose: () => void
  onChanged: () => void
}) {
  const { lesson: l, family, tz, secondTz } = props
  const toast = useToast()
  const [paid, setPaid] = useState(l.paid)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<null | 'cancel' | 'late' | 'series'>(null)

  const s2 = zonedParts(new Date(l.starts_at), secondTz)
  const e2 = zonedParts(new Date(l.ends_at), secondTz)

  async function togglePaid(v: boolean) {
    setPaid(v)
    const { error } = await supabase.from('bookings').update({ paid: v }).eq('id', l.id)
    if (error) {
      setPaid(!v)
      toast('Could not save. Please try again.')
    } else {
      props.onChanged()
    }
  }

  async function run(fn: string, args: Record<string, unknown>, done: string) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    toast(error ? rpcMessage(error)! : done)
    if (!error) {
      props.onChanged()
      props.onClose()
    }
  }

  if (confirm === 'late') {
    return (
      <Modal onClose={() => setConfirm(null)}>
        <h3>Late cancellation?</h3>
        <p className="muted" style={{ margin: '0 0 18px' }}>The lesson is cancelled but still charged and stays in Payments. The family gets an email.</p>
        <div className="actions">
          <button className="btn ghost" onClick={() => setConfirm(null)}>Back</button>
          <button className="btn danger" disabled={busy} onClick={() => run('mark_late_cancel', { p_id: l.id }, 'Marked as late cancellation')}>
            Charge as late cancellation
          </button>
        </div>
      </Modal>
    )
  }

  if (confirm) {
    // Cancel one lesson or the series from here – and say why (shown in the family's email)
    const series = confirm === 'series'
    const go = (reason: 'teacher' | 'family') =>
      series
        ? run('end_series', { p_series_id: l.series_id, p_from: l.starts_at, p_reason: reason }, 'Series ended')
        : run('cancel_booking', { p_id: l.id, p_reason: reason }, 'Lesson cancelled')
    return (
      <Modal onClose={() => setConfirm(null)}>
        <h3>{series ? 'End series from here?' : 'Cancel this lesson?'}</h3>
        <p className="muted" style={{ margin: '0 0 6px' }}>
          {series ? 'This lesson and all following lessons of the series are cancelled.' : 'The lesson is removed and not charged.'}
        </p>
        <p className="fieldlbl" style={{ margin: '12px 0 8px' }}>Why?</p>
        <div className="actions stack">
          <button className="btn danger" disabled={busy} onClick={() => go('family')}>The family asked for it</button>
          <button className="btn danger" disabled={busy} onClick={() => go('teacher')}>I can't make it</button>
          <button className="btn ghost" onClick={() => setConfirm(null)}>Back</button>
        </div>
      </Modal>
    )
  }

  const past = new Date(l.ends_at).getTime() < Date.now()

  return (
    <Modal onClose={props.onClose}>
      <h3 className="lessontitle">
        <span className="dot" style={{ '--c': family?.color ?? PALETTE[0] } as CSSProperties} />
        {family?.student_name ?? 'Student'}
      </h3>
      <div className="summary">
        <div className="big">
          {fmtDayShort(l.iso)}, {fromMin(l.start)}–{fromMin(l.end % 1440)}
        </div>
        <div className="muted small">
          {fromMin(s2.min)}–{fromMin(e2.min)} {tzShort(secondTz)} time
        </div>
        <div style={{ marginTop: 6 }}>
          {fmtDuration(l.duration_min)} · {money(l.price)}
          {l.series_id && ' · weekly'}
          {l.status === 'late' && <span className="tag red">Late cancellation (charged)</span>}
        </div>
      </div>
      <label className="switch">
        Paid
        <input type="checkbox" checked={paid} onChange={(e) => togglePaid(e.target.checked)} />
      </label>
      <div className="actions stack" style={{ marginTop: 8 }}>
        {l.status === 'booked' && !past && (
          <button className="btn danger" onClick={() => setConfirm('cancel')}>Cancel lesson</button>
        )}
        {l.status === 'booked' && (
          <button className="btn danger" onClick={() => setConfirm('late')}>Late cancellation (charge)</button>
        )}
        {l.status === 'booked' && l.series_id && !past && (
          <button className="btn danger" onClick={() => setConfirm('series')}>End series from here</button>
        )}
        {l.status === 'late' && (
          <button className="btn" disabled={busy} onClick={() => run('unmark_late', { p_id: l.id }, 'Not charged')}>Don't charge</button>
        )}
        <button className="btn ghost" onClick={props.onClose}>Close</button>
      </div>
      <p className="fine" style={{ margin: '10px 0 0' }}>Times are {tzShort(tz)} time.</p>
    </Modal>
  )
}

/* ---------- Add a lesson for a student ---------- */

type Free = { starts_at: string; max_duration: number }

export function AddLessonDialog(props: {
  families: FamilyLite[]
  tz: string
  defaultIso: string
  onClose: () => void
  onBooked: () => void
}) {
  const { tz } = props
  const toast = useToast()
  const active = props.families.filter((f) => f.active)
  const [famId, setFamId] = useState(active[0]?.id ?? '')
  const [iso, setIso] = useState(props.defaultIso)
  const [dur, setDur] = useState(60)
  const [free, setFree] = useState<Free[] | null>(null)
  const [start, setStart] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [until, setUntil] = useState(isoAddDays(props.defaultIso, 7 * 11))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fam = active.find((f) => f.id === famId)
  const price = fam ? fam[`price_${dur}` as 'price_60'] : null

  useEffect(() => {
    let stale = false
    setFree(null)
    supabase
      .rpc('get_free_starts', { p_from: zonedToUtc(iso, 0, tz).toISOString(), p_to: zonedToUtc(isoAddDays(iso, 1), 0, tz).toISOString() })
      .then(({ data, error }) => {
        if (stale) return
        if (error) setError(rpcMessage(error))
        else setFree(data as Free[])
      })
    return () => {
      stale = true
    }
  }, [iso, tz])

  const options = (free ?? []).filter((f) => f.max_duration >= dur)
  const chosen = options.some((o) => o.starts_at === start) ? start : options[0]?.starts_at ?? ''

  async function book() {
    if (!fam || !chosen) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('book_lessons', {
      p_starts_at: chosen,
      p_duration: dur,
      p_repeat_until: repeat ? zonedToUtc(isoAddDays(until, 1), 0, tz).toISOString() : null,
      p_family_id: fam.id,
    })
    setBusy(false)
    if (error) return setError(rpcMessage(error))
    const r = data as { booked: string[]; skipped: string[] }
    toast(`${r.booked.length} ${r.booked.length === 1 ? 'lesson' : 'lessons'} booked` + (r.skipped.length ? `, ${r.skipped.length} skipped (not free)` : ''))
    props.onBooked()
    props.onClose()
  }

  return (
    <Modal onClose={props.onClose}>
      <h3>Add a lesson</h3>
      {active.length === 0 ? (
        <p className="muted">Add a student first.</p>
      ) : (
        <div className="addform">
          <div className="two">
            <label className="field">
              Student
              <select className="inp" value={famId} onChange={(e) => setFamId(e.target.value)}>
                {active.map((f) => <option key={f.id} value={f.id}>{f.student_name}</option>)}
              </select>
            </label>
            <label className="field">
              Date
              <input type="date" value={iso} onChange={(e) => e.target.value && setIso(e.target.value)} />
            </label>
          </div>
          <div className="durpick" style={{ margin: 0 }}>
            {DURATIONS.map((d) => (
              <button key={d} type="button" className={d === dur ? 'on' : ''} onClick={() => setDur(d)}>
                {fmtDuration(d)}
                <small>{fam && fam[`price_${d}` as 'price_60'] != null ? money(fam[`price_${d}` as 'price_60']) : 'no price'}</small>
              </button>
            ))}
          </div>
          <label className="field">
            Start ({tzShort(tz)} time)
            {free === null ? (
              <span>Loading free times …</span>
            ) : options.length === 0 ? (
              <span>No free time for {fmtDuration(dur)} on this day.</span>
            ) : (
              <select className="inp" value={chosen} onChange={(e) => setStart(e.target.value)}>
                {options.map((o) => (
                  <option key={o.starts_at} value={o.starts_at}>{fromMin(zonedParts(new Date(o.starts_at), tz).min)}</option>
                ))}
              </select>
            )}
          </label>
          <label className="switch" style={{ paddingBottom: 0 }}>
            Repeat every week
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          </label>
          {repeat && (
            <label className="field">
              Until
              <input type="date" min={iso} max={isoAddDays(iso, 364)} value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
          {error && <p className="formerror">{error}</p>}
          <div className="actions">
            <button className="btn ghost" onClick={props.onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || !chosen || price == null} onClick={book}>
              {busy ? 'Booking …' : price == null ? 'No price set' : 'Book'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
