import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { DURATIONS, PALETTE, fmtDuration, fmtHours, money } from '../lib/format'
import { ConfirmDialog, Modal, useToast } from '../lib/ui'
import { callFunction } from '../lib/functions'

type Family = {
  id: string
  student_name: string | null
  parent_name: string | null
  email: string
  color: string | null
  price_60: number | null
  price_90: number | null
  price_120: number | null
  timezone: string
  active: boolean
}

type BookingLite = { family_id: string; ends_at: string; duration_min: number; status: string; paid: boolean; price: number }

type PriceKey = 'price_60' | 'price_90' | 'price_120'

const TIMEZONES: [string, string][] = [
  ['Asia/Hong_Kong', 'Hong Kong'],
  ['Asia/Shanghai', 'Mainland China'],
  ['Asia/Singapore', 'Singapore'],
  ['Europe/Berlin', 'Germany / Austria / Switzerland'],
  ['Europe/London', 'United Kingdom'],
]

function priceKey(d: number) {
  return `price_${d}` as PriceKey
}

function parsePrice(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

type Dialog =
  | { kind: 'add' }
  | { kind: 'resend'; fam: Family; signedIn: boolean }
  | { kind: 'deactivate' | 'activate' | 'delete'; fam: Family }
  | null

export default function StudentsTab() {
  const toast = useToast()
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [bookings, setBookings] = useState<BookingLite[]>([])
  const [signedIn, setSignedIn] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = useCallback(async () => {
    const [fam, bk, st] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, student_name, parent_name, email, color, price_60, price_90, price_120, timezone, active')
        .eq('role', 'family')
        .order('created_at'),
      supabase.from('bookings').select('family_id, ends_at, duration_min, status, paid, price'),
      supabase.rpc('family_login_status'),
    ])
    if (fam.error || bk.error || st.error) {
      setLoadError(true)
      return
    }
    setLoadError(false)
    setFamilies(fam.data as Family[])
    setBookings(bk.data as BookingLite[])
    setSignedIn(Object.fromEntries((st.data as { id: string; last_sign_in_at: string | null }[]).map((r) => [r.id, !!r.last_sign_in_at])))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveField(id: string, patch: Partial<Family>) {
    setFamilies((list) => list?.map((f) => (f.id === id ? { ...f, ...patch } : f)) ?? null)
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) {
      toast('Could not save. Please try again.')
      load()
    } else {
      toast('Saved')
    }
  }

  async function runAction(action: string, fam: Family, done: string) {
    try {
      await callFunction('invite-family', { action, id: fam.id })
      toast(done)
      await load()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (loadError) {
    return (
      <div className="card placeholder">
        Could not load students. <button className="btn sm" onClick={load}>Try again</button>
      </div>
    )
  }
  if (!families) return <p className="muted">Loading …</p>

  const now = Date.now()

  return (
    <>
      <div className="toolbar">
        <p className="muted small" style={{ margin: 0, flex: 1, minWidth: '14em' }}>
          One account per family: parents and student share the same login. Each family only sees its own prices.
        </p>
        <button className="btn primary sm" onClick={() => setDialog({ kind: 'add' })}>+ Add student</button>
      </div>

      {families.length === 0 ? (
        <p className="none">No students yet. Add your first one with “+ Add student”.</p>
      ) : (
        <div className="sgrid2">
          {families.map((f) => {
            const bs = bookings.filter((b) => b.family_id === f.id)
            const ended = (b: BookingLite) => new Date(b.ends_at).getTime() < now
            const heldMin = bs.filter((b) => b.status === 'booked' && ended(b)).reduce((s, b) => s + b.duration_min, 0)
            const unpaid = bs
              .filter((b) => !b.paid && (b.status === 'late' || (b.status === 'booked' && ended(b))))
              .reduce((s, b) => s + Number(b.price), 0)
            const pending = !signedIn[f.id]
            const tzKnown = TIMEZONES.some(([v]) => v === f.timezone)

            return (
              <div key={f.id} className="card scard" style={{ '--c': f.color ?? PALETTE[0] } as CSSProperties}>
                <input
                  className="nm"
                  defaultValue={f.student_name ?? ''}
                  aria-label="Student name"
                  onBlur={(e) => e.target.value.trim() !== (f.student_name ?? '') && saveField(f.id, { student_name: e.target.value.trim() })}
                />
                <div style={{ margin: '-4px 0 10px' }}>
                  {pending && <span className="tag gold" style={{ marginLeft: 0 }}>Invitation pending</span>}
                  {!f.active && <span className="tag red" style={{ marginLeft: pending ? 6 : 0 }}>Deactivated</span>}
                </div>
                <div className="f">
                  <label htmlFor={`p-${f.id}`}>Parent</label>
                  <input
                    id={`p-${f.id}`}
                    type="text"
                    defaultValue={f.parent_name ?? ''}
                    onBlur={(e) => e.target.value.trim() !== (f.parent_name ?? '') && saveField(f.id, { parent_name: e.target.value.trim() || null })}
                  />
                </div>
                <div className="f">
                  <label>Email</label>
                  <span style={{ overflowWrap: 'anywhere' }}>{f.email}</span>
                </div>
                <div className="f">
                  <label htmlFor={`tz-${f.id}`}>Time zone</label>
                  <select id={`tz-${f.id}`} className="inp" value={f.timezone} onChange={(e) => saveField(f.id, { timezone: e.target.value })}>
                    {!tzKnown && <option value={f.timezone}>{f.timezone}</option>}
                    {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="prices">
                  {DURATIONS.map((d) => (
                    <label key={d}>
                      {fmtDuration(d)} (HK$)
                      <input
                        type="number"
                        min={0}
                        step={10}
                        inputMode="decimal"
                        defaultValue={f[priceKey(d)] ?? ''}
                        onBlur={(e) => {
                          const v = parsePrice(e.target.value)
                          if (v !== (f[priceKey(d)] === null ? null : Number(f[priceKey(d)]))) saveField(f.id, { [priceKey(d)]: v })
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="swatches" role="group" aria-label="Colour">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      className={'sw' + (f.color === c ? ' on' : '')}
                      style={{ '--c': c } as CSSProperties}
                      aria-label={`Colour ${c}`}
                      aria-pressed={f.color === c}
                      onClick={() => f.color !== c && saveField(f.id, { color: c })}
                    />
                  ))}
                </div>
                <p className="sstats">
                  {fmtHours(heldMin)} taught ·{' '}
                  {unpaid ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{money(unpaid)} unpaid</span> : 'nothing unpaid'}
                </p>
                <div className="srow">
                  <button className="btn sm" onClick={() => setDialog({ kind: 'resend', fam: f, signedIn: !pending })}>
                    {pending ? 'Resend invitation' : 'Send password link'}
                  </button>
                  {f.active ? (
                    <button className="btn sm" onClick={() => setDialog({ kind: 'deactivate', fam: f })}>Deactivate</button>
                  ) : (
                    <button className="btn sm" onClick={() => setDialog({ kind: 'activate', fam: f })}>Activate</button>
                  )}
                  {bs.length === 0 && (
                    <button className="btn sm danger" onClick={() => setDialog({ kind: 'delete', fam: f })}>Delete</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="fine" style={{ marginTop: 14 }}>
        New prices only apply to new bookings. Lessons already booked keep their price.
      </p>

      {dialog?.kind === 'add' && <AddStudentDialog onClose={() => setDialog(null)} onDone={load} />}
      {dialog?.kind === 'resend' && (
        <ConfirmDialog
          title={dialog.signedIn ? 'Send password link?' : 'Resend invitation?'}
          text={
            dialog.signedIn
              ? `${dialog.fam.email} gets an email with a link to set a new password.`
              : `${dialog.fam.email} gets the invitation email again.`
          }
          okLabel="Send email"
          onOk={() => runAction('resend', dialog.fam, 'Email sent')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deactivate' && (
        <ConfirmDialog
          title={`Deactivate ${dialog.fam.student_name ?? 'this family'}?`}
          text="The family can no longer sign in. All lessons and payments stay saved, and you can activate the account again at any time."
          okLabel="Deactivate"
          danger
          onOk={() => runAction('deactivate', dialog.fam, 'Account deactivated')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'activate' && (
        <ConfirmDialog
          title={`Activate ${dialog.fam.student_name ?? 'this family'}?`}
          text="The family can sign in and book again."
          okLabel="Activate"
          onOk={() => runAction('activate', dialog.fam, 'Account activated')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${dialog.fam.student_name ?? 'this family'}?`}
          text="The account is deleted for good. This is only possible as long as there are no lessons."
          okLabel="Delete"
          danger
          onOk={() => runAction('delete', dialog.fam, 'Student deleted')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

function AddStudentDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [form, setForm] = useState({
    student_name: '',
    parent_name: '',
    email: '',
    price_60: '',
    price_90: '',
    price_120: '',
    timezone: 'Asia/Hong_Kong',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await callFunction('invite-family', {
        action: 'invite',
        ...form,
        price_60: parsePrice(form.price_60),
        price_90: parsePrice(form.price_90),
        price_120: parsePrice(form.price_120),
      })
      toast(`Invitation sent to ${form.email.trim()}`)
      await onDone()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3>Add student</h3>
      <form onSubmit={submit} className="addform">
        <label className="field">
          Student name
          <input type="text" required autoFocus value={form.student_name} onChange={set('student_name')} placeholder="e.g. Mia Berger" />
        </label>
        <label className="field">
          Parent name <span>optional</span>
          <input type="text" value={form.parent_name} onChange={set('parent_name')} />
        </label>
        <label className="field">
          Email for the login
          <input type="email" required value={form.email} onChange={set('email')} />
          <span>The family gets an invitation to this address and sets its own password.</span>
        </label>
        <div className="prices" style={{ margin: 0 }}>
          {DURATIONS.map((d) => (
            <label key={d}>
              {fmtDuration(d)} (HK$)
              <input type="number" min={0} step={10} inputMode="decimal" value={form[priceKey(d)]} onChange={set(priceKey(d))} />
            </label>
          ))}
        </div>
        <label className="field">
          Time zone <span>used for the family's emails</span>
          <select className="inp" value={form.timezone} onChange={set('timezone')}>
            {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {error && <p className="formerror">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending …' : 'Send invitation'}</button>
        </div>
      </form>
    </Modal>
  )
}
