import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { DURATIONS, PALETTE, fmtDuration, fmtHours, money } from '../lib/format'
import { ConfirmDialog, Modal, useToast } from '../lib/ui'
import { callFunction } from '../lib/functions'

type Family = {
  id: string
  student_name: string | null
  username: string | null
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

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/
const USERNAME_HINT = 'Usernames need 3–30 characters: lowercase letters, numbers, dot, dash or underscore.'

const priceKey = (d: number) => `price_${d}` as PriceKey

// "Mia Berger" → "mia"
function suggestUsername(studentName: string) {
  const first = studentName.trim().split(/\s+/)[0] ?? ''
  const clean = first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '')
  return clean.length >= 3 ? clean.slice(0, 30) : ''
}

function parsePrice(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const priceText = (v: number | null) => (v == null ? '–' : new Intl.NumberFormat('en-GB').format(Number(v)))

type Stats = { heldMin: number; unpaid: number; count: number }

export default function StudentsTab() {
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [bookings, setBookings] = useState<BookingLite[]>([])
  const [signedIn, setSignedIn] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Family | null>(null)

  const load = useCallback(async () => {
    const [fam, bk, st] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, student_name, username, parent_name, email, color, price_60, price_90, price_120, timezone, active')
        .eq('role', 'family')
        .order('student_name'),
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

  if (loadError) {
    return (
      <div className="card placeholder">
        Could not load students. <button className="btn sm" onClick={load}>Try again</button>
      </div>
    )
  }
  if (!families) return <p className="muted">Loading …</p>

  const now = Date.now()
  function stats(id: string): Stats {
    const bs = bookings.filter((b) => b.family_id === id)
    const ended = (b: BookingLite) => new Date(b.ends_at).getTime() < now
    return {
      count: bs.length,
      heldMin: bs.filter((b) => b.status === 'booked' && ended(b)).reduce((s, b) => s + b.duration_min, 0),
      unpaid: bs.filter((b) => !b.paid && (b.status === 'late' || (b.status === 'booked' && ended(b)))).reduce((s, b) => s + Number(b.price), 0),
    }
  }

  return (
    <>
      <div className="toolbar">
        <p className="muted small" style={{ margin: 0, flex: 1, minWidth: '12em' }}>
          {families.length} {families.length === 1 ? 'student' : 'students'} · tap a row to edit
        </p>
        <button className="btn primary sm" onClick={() => setAdding(true)}>+ Add student</button>
      </div>

      {families.length === 0 ? (
        <p className="none">No students yet. Add your first one with “+ Add student”.</p>
      ) : (
        <div className="card stable">
          <div className="srow-head">
            <span>Student</span>
            <span className="num">1 / 1.5 / 2 hrs (HK$)</span>
            <span className="num">Unpaid</span>
          </div>
          {families.map((f) => {
            const st = stats(f.id)
            return (
              <button key={f.id} className={'srow-item' + (f.active ? '' : ' inactive')} onClick={() => setEditing(f)}>
                <span className="who2">
                  <span className="dot" style={{ '--c': f.color ?? PALETTE[0] } as CSSProperties} />
                  <span>
                    <b>{f.student_name || f.email}</b>
                    <small>
                      {f.username ? `@${f.username}` : f.email}
                      {!signedIn[f.id] && <span className="tag gold">Invited</span>}
                      {!f.active && <span className="tag red">Deactivated</span>}
                    </small>
                  </span>
                </span>
                <span className="num prices3">
                  {priceText(f.price_60)} / {priceText(f.price_90)} / {priceText(f.price_120)}
                </span>
                <span className={'num' + (st.unpaid ? ' due' : ' muted')}>{st.unpaid ? money(st.unpaid) : '–'}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="fine" style={{ marginTop: 12 }}>New prices only apply to new bookings.</p>

      {adding && <AddStudentDialog onClose={() => setAdding(false)} onDone={load} />}
      {editing && (
        <EditStudentDialog
          fam={editing}
          stats={stats(editing.id)}
          signedIn={!!signedIn[editing.id]}
          onClose={() => setEditing(null)}
          onDone={load}
        />
      )}
    </>
  )
}

/* ---------- Edit ---------- */

function EditStudentDialog(props: { fam: Family; stats: Stats; signedIn: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const { fam, stats } = props
  const toast = useToast()
  const [form, setForm] = useState({
    student_name: fam.student_name ?? '',
    username: fam.username ?? '',
    parent_name: fam.parent_name ?? '',
    timezone: fam.timezone,
    color: fam.color ?? PALETTE[0],
    price_60: fam.price_60?.toString() ?? '',
    price_90: fam.price_90?.toString() ?? '',
    price_120: fam.price_120?.toString() ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'resend' | 'deactivate' | 'activate' | 'delete' | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const tzKnown = TIMEZONES.some(([v]) => v === form.timezone)

  async function save(e: FormEvent) {
    e.preventDefault()
    const username = form.username.trim().toLowerCase()
    if (!form.student_name.trim()) return setError("Please enter the student's name.")
    if (username && !USERNAME_RE.test(username)) return setError(USERNAME_HINT)
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        student_name: form.student_name.trim(),
        username: username || null,
        parent_name: form.parent_name.trim() || null,
        timezone: form.timezone,
        color: form.color,
        price_60: parsePrice(form.price_60),
        price_90: parsePrice(form.price_90),
        price_120: parsePrice(form.price_120),
      })
      .eq('id', fam.id)
    setBusy(false)
    if (error) return setError(error.code === '23505' ? 'This username is already taken.' : 'Could not save. Please try again.')
    toast('Saved')
    await props.onDone()
    props.onClose()
  }

  async function action(name: string, done: string) {
    try {
      await callFunction('invite-family', { action: name, id: fam.id })
      toast(done)
      await props.onDone()
      props.onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (confirm === 'resend') {
    return (
      <ConfirmDialog
        title={props.signedIn ? 'Send password link?' : 'Resend invitation?'}
        text={props.signedIn ? `${fam.email} gets an email with a link to set a new password.` : `${fam.email} gets the invitation email again.`}
        okLabel="Send email"
        onOk={() => action('resend', 'Email sent')}
        onClose={() => setConfirm(null)}
      />
    )
  }
  if (confirm === 'deactivate' || confirm === 'activate' || confirm === 'delete') {
    const texts = {
      deactivate: ['Deactivate', 'The family can no longer sign in. Lessons and payments stay saved. You can activate the account again any time.', 'Account deactivated'],
      activate: ['Activate', 'The family can sign in and book again.', 'Account activated'],
      delete: ['Delete', 'The account is deleted for good. This is only possible while there are no lessons.', 'Student deleted'],
    }[confirm]
    return (
      <ConfirmDialog
        title={`${texts[0]} ${fam.student_name ?? 'this student'}?`}
        text={texts[1]}
        okLabel={texts[0]}
        danger={confirm !== 'activate'}
        onOk={() => action(confirm, texts[2])}
        onClose={() => setConfirm(null)}
      />
    )
  }

  return (
    <Modal onClose={props.onClose}>
      <h3>{fam.student_name || 'Student'}</h3>
      <p className="muted small" style={{ margin: '-6px 0 14px' }}>
        {fmtHours(stats.heldMin)} taught · {stats.unpaid ? `${money(stats.unpaid)} unpaid` : 'nothing unpaid'}
      </p>
      <form onSubmit={save} className="addform">
        <div className="two">
          <label className="field">
            Student name
            <input type="text" required value={form.student_name} onChange={set('student_name')} />
          </label>
          <label className="field">
            Username
            <input type="text" autoCapitalize="none" spellCheck={false} placeholder="optional" value={form.username} onChange={set('username')} />
          </label>
        </div>
        <div className="two">
          <label className="field">
            Parent
            <input type="text" placeholder="optional" value={form.parent_name} onChange={set('parent_name')} />
          </label>
          <label className="field">
            Time zone
            <select className="inp" value={form.timezone} onChange={set('timezone')}>
              {!tzKnown && <option value={form.timezone}>{form.timezone}</option>}
              {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          Email (login)
          <input type="email" value={fam.email} disabled />
        </label>
        <div className="prices" style={{ margin: 0 }}>
          {DURATIONS.map((d) => (
            <label key={d}>
              {fmtDuration(d)} (HK$)
              <input type="number" min={0} step={10} inputMode="decimal" value={form[priceKey(d)]} onChange={set(priceKey(d))} />
            </label>
          ))}
        </div>
        <div className="swatches" role="group" aria-label="Colour" style={{ margin: 0 }}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={'sw' + (form.color === c ? ' on' : '')}
              style={{ '--c': c } as CSSProperties}
              aria-label={`Colour ${c}`}
              aria-pressed={form.color === c}
              onClick={() => setForm({ ...form, color: c })}
            />
          ))}
        </div>
        {error && <p className="formerror">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving …' : 'Save'}</button>
        </div>
      </form>
      <div className="dangerzone">
        <button className="btn sm" onClick={() => setConfirm('resend')}>{props.signedIn ? 'Send password link' : 'Resend invitation'}</button>
        {fam.active ? (
          <button className="btn sm" onClick={() => setConfirm('deactivate')}>Deactivate</button>
        ) : (
          <button className="btn sm" onClick={() => setConfirm('activate')}>Activate</button>
        )}
        {stats.count === 0 && <button className="btn sm danger" onClick={() => setConfirm('delete')}>Delete</button>}
      </div>
    </Modal>
  )
}

/* ---------- Add ---------- */

function AddStudentDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [form, setForm] = useState({
    student_name: '',
    username: '',
    parent_name: '',
    email: '',
    price_60: '',
    price_90: '',
    price_120: '',
    timezone: 'Asia/Hong_Kong',
  })
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const username = form.username.trim().toLowerCase()
    if (username && !USERNAME_RE.test(username)) return setError(USERNAME_HINT)
    setBusy(true)
    setError(null)
    try {
      await callFunction('invite-family', {
        action: 'invite',
        ...form,
        username,
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
        <div className="two">
          <label className="field">
            Student name
            <input
              type="text"
              required
              autoFocus
              value={form.student_name}
              placeholder="e.g. Mia Berger"
              onChange={(e) =>
                setForm({ ...form, student_name: e.target.value, username: usernameTouched ? form.username : suggestUsername(e.target.value) })
              }
            />
          </label>
          <label className="field">
            Username
            <input
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="optional"
              value={form.username}
              onChange={(e) => {
                setUsernameTouched(true)
                setForm({ ...form, username: e.target.value })
              }}
            />
          </label>
        </div>
        <label className="field">
          Email for the login
          <input type="email" required value={form.email} onChange={set('email')} />
          <span>The family gets an invitation with the username and sets its own password.</span>
        </label>
        <div className="two">
          <label className="field">
            Parent
            <input type="text" placeholder="optional" value={form.parent_name} onChange={set('parent_name')} />
          </label>
          <label className="field">
            Time zone
            <select className="inp" value={form.timezone} onChange={set('timezone')}>
              {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="prices" style={{ margin: 0 }}>
          {DURATIONS.map((d) => (
            <label key={d}>
              {fmtDuration(d)} (HK$)
              <input type="number" min={0} step={10} inputMode="decimal" value={form[priceKey(d)]} onChange={set(priceKey(d))} />
            </label>
          ))}
        </div>
        {error && <p className="formerror">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending …' : 'Send invitation'}</button>
        </div>
      </form>
    </Modal>
  )
}
