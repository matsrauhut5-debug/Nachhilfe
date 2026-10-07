import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DURATIONS, fmtDuration, money } from '../lib/format'
import { fmtDayLong, fmtDayShort, fromMin, isoAddDays, weekdayOf, WD_LONG, zonedParts, zonedToUtc } from '../lib/time'
import { rpcMessage } from '../lib/rpc'
import { Modal, useToast } from '../lib/ui'

export type Prices = Record<number, number | null>

type Preview = { starts_at: string; free: boolean }[]

export default function BookDialog(props: {
  start: Date
  maxDuration: number
  prices: Prices
  preferredDuration: number
  tz: string // the family's device time zone
  onClose: () => void
  onBooked: () => void
}) {
  const { start, prices, tz } = props
  const toast = useToast()
  const local = zonedParts(start, tz)
  const valid = DURATIONS.filter((d) => d <= props.maxDuration && prices[d] != null)
  const [dur, setDur] = useState<number>(valid.includes(props.preferredDuration as never) ? props.preferredDuration : valid[0] ?? 60)
  const [repeat, setRepeat] = useState(false)
  const [endIso, setEndIso] = useState(isoAddDays(local.iso, 7 * 11))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxEnd = isoAddDays(local.iso, 364)
  const end = endIso < local.iso ? local.iso : endIso > maxEnd ? maxEnd : endIso
  // exclusive end: midnight after the chosen day, in the family's time zone
  const until = zonedToUtc(isoAddDays(end, 1), 0, tz)

  useEffect(() => {
    if (!repeat) return
    let stale = false
    setPreview(null)
    supabase
      .rpc('preview_series', { p_starts_at: start.toISOString(), p_duration: dur, p_repeat_until: until.toISOString() })
      .then(({ data, error }) => {
        if (stale) return
        if (error) setError(rpcMessage(error))
        else setPreview(data as Preview)
      })
    return () => {
      stale = true
    }
  }, [repeat, dur, end])

  const free = repeat && preview ? preview.filter((p) => p.free).map((p) => new Date(p.starts_at)) : [start]
  const skipped = repeat && preview ? preview.filter((p) => !p.free).map((p) => new Date(p.starts_at)) : []
  // Germany changes its clocks; Hong Kong doesn't – show where the local time moves
  const shifted = free.find((d) => zonedParts(d, tz).min !== local.min)
  const count = free.length

  async function book() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('book_lessons', {
      p_starts_at: start.toISOString(),
      p_duration: dur,
      p_repeat_until: repeat ? until.toISOString() : null,
    })
    setBusy(false)
    if (error) return setError(rpcMessage(error))
    const booked = (data as { booked: string[] }).booked.length
    toast(
      booked > 1
        ? `${booked} lessons booked, every ${WD_LONG[weekdayOf(local.iso)]} at ${fromMin(local.min)}`
        : `Booked: ${fmtDayShort(local.iso)}, ${fromMin(local.min)}`,
    )
    props.onBooked()
    props.onClose()
  }

  return (
    <Modal onClose={props.onClose}>
      <h3>Book a lesson</h3>
      <div className="summary">
        <div className="big">{fmtDayLong(local.iso)}</div>
        <div>
          {fromMin(local.min)}–{fromMin((local.min + dur) % 1440)} · {money(prices[dur])}
        </div>
      </div>

      <p className="fieldlbl">How long?</p>
      <div className="durpick">
        {DURATIONS.map((d) => (
          <button key={d} type="button" className={d === dur ? 'on' : ''} disabled={!valid.includes(d)} onClick={() => setDur(d)}>
            {fmtDuration(d)}
            <small>{prices[d] != null ? money(prices[d]) : '–'}</small>
          </button>
        ))}
      </div>

      <label className="switch">
        Every week at this time
        <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
      </label>
      {repeat && (
        <div className="repbox">
          <label className="field">
            Until when?
            <input type="date" min={local.iso} max={maxEnd} value={endIso} onChange={(e) => setEndIso(e.target.value)} />
          </label>
          <div className="quick">
            {[
              [4, '4 weeks'],
              [12, '12 weeks'],
              [26, 'Half a year'],
            ].map(([w, label]) => (
              <button key={w} type="button" className="btn sm" onClick={() => setEndIso(isoAddDays(local.iso, 7 * (Number(w) - 1)))}>
                {label}
              </button>
            ))}
          </div>
          <div className="prev">
            {!preview ? (
              <span className="muted">Checking which weeks are free …</span>
            ) : (
              <>
                <b>{count} {count === 1 ? 'lesson' : 'lessons'}</b>
                {skipped.length > 0 && (
                  <div className="bad">Not free, will be skipped: {skipped.map((d) => fmtDayShort(zonedParts(d, tz).iso)).join(', ')}</div>
                )}
                {shifted && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    From {fmtDayShort(zonedParts(shifted, tz).iso)} the lesson is at {fromMin(zonedParts(shifted, tz).min)} your time
                    (clock change in Germany).
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && <p className="formerror" style={{ marginTop: 12 }}>{error}</p>}
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={props.onClose}>Cancel</button>
        <button className="btn primary" onClick={book} disabled={busy || valid.length === 0 || (repeat && !preview)}>
          {busy ? 'Booking …' : count > 1 ? `Book ${count} lessons` : 'Book lesson'}
        </button>
      </div>
    </Modal>
  )
}
