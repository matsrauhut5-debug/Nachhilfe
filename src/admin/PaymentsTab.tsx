import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../supabase'
import { PALETTE, fmtDuration, money } from '../lib/format'
import { MON_LONG, fmtDayShort, fromMin, zonedParts, zonedToUtc } from '../lib/time'
import { useToast } from '../lib/ui'
import { copyText, download } from '../lib/clipboard'
import { BOOKING_COLS, place, useFamilies, type Booking, type Placed } from './data'
import type { Settings } from './availability'

export default function PaymentsTab({ settings }: { settings: Settings }) {
  const tz = settings.timezone
  const toast = useToast()
  const families = useFamilies()
  const [month, setMonth] = useState(() => zonedParts(new Date(), tz).iso.slice(0, 8) + '01')
  const [filter, setFilter] = useState('all')
  const [rows, setRows] = useState<Placed[] | null>(null)

  const load = useCallback(async () => {
    const [y, m] = month.split('-').map(Number)
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('bookings')
      .select(BOOKING_COLS)
      .neq('status', 'cancelled')
      .gte('starts_at', zonedToUtc(month, 0, tz).toISOString())
      .lt('starts_at', zonedToUtc(next, 0, tz).toISOString())
      .order('starts_at')
    if (error) {
      toast('Could not load payments.')
      return
    }
    setRows((data as Booking[]).map((b) => place(b, tz)))
  }, [month, tz, toast])

  useEffect(() => {
    load()
  }, [load])

  function step(dir: number) {
    const [y, m] = month.split('-').map(Number)
    setMonth(new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10))
  }

  async function togglePaid(b: Placed) {
    setRows((r) => r?.map((x) => (x.id === b.id ? { ...x, paid: !b.paid } : x)) ?? null)
    const { error } = await supabase.from('bookings').update({ paid: !b.paid }).eq('id', b.id)
    if (error) {
      toast('Could not save. Please try again.')
      load()
    }
  }

  const now = Date.now()
  const shown = (rows ?? []).filter((b) => filter === 'all' || b.family_id === filter)
  const isDue = (b: Placed) => b.status === 'late' || new Date(b.ends_at).getTime() < now
  let due = 0
  let paid = 0
  let planned = 0
  const perStudent: Record<string, number> = {}
  for (const b of shown) {
    const p = Number(b.price)
    if (b.paid) paid += p
    else if (isDue(b)) {
      due += p
      perStudent[b.family_id] = (perStudent[b.family_id] ?? 0) + p
    } else planned += p
  }
  const name = (id: string) => families[id]?.student_name ?? 'Former student'

  async function copyForSheets() {
    // Tab-separated, pastes straight into Google Sheets columns
    const lines = [['Date', 'Student', 'Start', 'Duration (hrs)', 'Amount (HKD)', 'Status'].join('\t')]
    for (const b of shown) {
      lines.push(
        [b.iso, name(b.family_id), fromMin(b.start), String(b.duration_min / 60), String(Number(b.price)), b.paid ? 'Paid' : b.status === 'late' ? 'Late cancellation' : isDue(b) ? 'Open' : 'Planned'].join('\t'),
      )
    }
    toast((await copyText(lines.join('\n'))) ? `${shown.length} rows copied – paste them into Google Sheets` : 'Could not copy.')
  }

  async function exportAll() {
    const [profiles, bookings, template, overrides, s] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('bookings').select('*').order('starts_at'),
      supabase.from('availability_template').select('*'),
      supabase.from('availability_override').select('*'),
      supabase.from('settings').select('cancel_hours, timezone, second_timezone, admin_email'),
    ])
    if (profiles.error || bookings.error) return toast('Export failed. Please try again.')
    const stamp = new Date().toISOString().slice(0, 10)
    download(
      `tutoring-backup-${stamp}.json`,
      JSON.stringify({ exported_at: new Date().toISOString(), profiles: profiles.data, bookings: bookings.data, availability_template: template.data, availability_override: overrides.data, settings: s.data }, null, 2),
      'application/json',
    )
    const cols = ['id', 'family_id', 'starts_at', 'ends_at', 'duration_min', 'series_id', 'status', 'price', 'paid', 'created_at', 'cancelled_at']
    const csv = [cols.join(',')]
      .concat((bookings.data as Record<string, unknown>[]).map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(',')))
      .join('\n')
    download(`tutoring-bookings-${stamp}.csv`, csv, 'text/csv')
    toast('Backup downloaded')
  }

  const [y, m] = month.split('-').map(Number)

  return (
    <>
      <div className="toolbar">
        <div className="wk">
          <button className="iconbtn" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
          <span className="wklabel">{MON_LONG[m - 1]} {y}</span>
          <button className="iconbtn" aria-label="Next month" onClick={() => step(1)}>›</button>
        </div>
        <span className="grow" />
        <select className="inp" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by student">
          <option value="all">All students</option>
          {Object.values(families).map((f) => <option key={f.id} value={f.id}>{f.student_name}</option>)}
        </select>
      </div>

      <div className="sums">
        <div className="card sum open"><div className="v">{money(due)}</div><div className="k">Due, not paid yet</div></div>
        <div className="card sum paid"><div className="v">{money(paid)}</div><div className="k">Paid</div></div>
        <div className="card sum"><div className="v">{money(planned)}</div><div className="k">Still planned</div></div>
      </div>
      {filter === 'all' && Object.keys(perStudent).length > 0 && (
        <p className="perstudent">Open: {Object.entries(perStudent).map(([id, v]) => `${name(id).split(' ')[0]} ${money(v)}`).join(' · ')}</p>
      )}

      {rows === null ? (
        <p className="muted">Loading …</p>
      ) : shown.length === 0 ? (
        <p className="none">No lessons in this month.</p>
      ) : (
        <div className="card tbl-wrap">
          <table className="pay">
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Length</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td>
                    {fmtDayShort(b.iso)}, {fromMin(b.start)}
                    {!isDue(b) && <span className="tag grey">planned</span>}
                    {b.status === 'late' && <span className="tag red">late cancel</span>}
                  </td>
                  <td>
                    <span className="dot" style={{ '--c': families[b.family_id]?.color ?? PALETTE[0] } as CSSProperties} />
                    {name(b.family_id)}
                  </td>
                  <td>{fmtDuration(b.duration_min)}</td>
                  <td className="num">{money(b.price)}</td>
                  <td>
                    <button className={'paybtn ' + (b.paid ? 'paid' : 'open')} onClick={() => togglePaid(b)}>
                      {b.paid ? 'Paid' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="srow" style={{ marginTop: 14 }}>
        <button className="btn sm" onClick={copyForSheets} disabled={!shown.length}>Copy for Google Sheets</button>
        <button className="btn sm ghost" onClick={exportAll}>Download backup</button>
      </div>
      <p className="fine" style={{ marginTop: 8 }}>
        “Download backup” saves all data (JSON + CSV) on this device.
      </p>
    </>
  )
}
