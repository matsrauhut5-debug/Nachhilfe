import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { WD_LONG, WD_SHORT, WEEK_ORDER, fmtOffset, tzName, tzOffsetMin, tzShort } from '../lib/time'
import { ConfirmDialog, Modal, useToast } from '../lib/ui'
import { copyText } from '../lib/clipboard'
import TimeGrid from './TimeGrid'
import { useAvailability, type Settings } from './availability'
import EmailPrefs from '../auth/EmailPrefs'

export default function SettingsTab({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  return (
    <>
      <UsualHours settings={settings} />
      <div className="settings-grid">
        <Cancellation settings={settings} onSettings={onSettings} />
        <AppleCalendar />
        <section className="card panel">
          <h3>Emails to you</h3>
          <p className="muted small">Invitation and password emails to families are always sent.</p>
          <EmailPrefs withReport />
        </section>
      </div>
    </>
  )
}

/* ---------- Usual hours ---------- */

function UsualHours({ settings }: { settings: Settings }) {
  const toast = useToast()
  const { template, saveTemplateDay, error, reload } = useAvailability()
  const [menuDay, setMenuDay] = useState<number | null>(null)
  const [edit, setEdit] = useState(false)

  if (error) {
    return (
      <div className="card placeholder">
        Could not load your hours. <button className="btn sm" onClick={reload}>Try again</button>
      </div>
    )
  }
  if (!template) return <p className="muted">Loading …</p>

  const offset = tzOffsetMin(new Date(), settings.timezone, settings.second_timezone)

  async function commit(changes: Record<string, number[]>) {
    const results = await Promise.all(Object.entries(changes).map(([wd, slots]) => saveTemplateDay(Number(wd), slots)))
    toast(results.every(Boolean) ? 'Saved' : 'Could not save. Please try again.')
  }

  return (
    <section className="setting">
      <div className="setting-head">
        <div>
          <h3>Usual hours</h3>
          <p className="muted small">Your normal week, used every week. Single days you change in Week → Edit hours.</p>
        </div>
        {edit ? (
          <button className="btn primary sm" onClick={() => setEdit(false)}>Done</button>
        ) : (
          <button className="btn sm" onClick={() => setEdit(true)}>Edit</button>
        )}
      </div>
      {edit && <p className="edithint"><span>Tap or drag to open or block times. Tap a weekday at the top to clear it.</span></p>}
      <TimeGrid
        edit={edit}
        onCommit={commit}
        mainLabel={tzShort(settings.timezone)}
        second={{ label: tzShort(settings.second_timezone), offsetMin: offset }}
        columns={WEEK_ORDER.map((wd) => ({
          key: String(wd),
          head: <div className="dn">{WD_SHORT[wd]}</div>,
          onHeadClick: edit ? () => setMenuDay(wd) : undefined,
          slots: template[wd],
        }))}
      />
      <p className="tznote">
        {tzName(settings.timezone)} time · <b>{tzShort(settings.second_timezone)} {fmtOffset(offset)}</b> today (changes by 1 h when Germany switches
        summer/winter time)
      </p>

      {menuDay !== null && (
        <Modal onClose={() => setMenuDay(null)}>
          <h3>{WD_LONG[menuDay]}</h3>
          <div className="actions stack">
            <button
              className="btn danger"
              onClick={async () => {
                setMenuDay(null)
                toast((await saveTemplateDay(menuDay, [])) ? `No hours on ${WD_LONG[menuDay]}s` : 'Could not save. Please try again.')
              }}
            >
              No hours on this day
            </button>
            <button className="btn ghost" onClick={() => setMenuDay(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

/* ---------- Cancellation deadline ---------- */

function Cancellation({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const toast = useToast()
  async function change(hours: number) {
    const prev = settings
    onSettings({ ...settings, cancel_hours: hours })
    const { error } = await supabase.from('settings').update({ cancel_hours: hours }).eq('id', 1)
    if (error) {
      onSettings(prev)
      toast('Could not save. Please try again.')
    } else {
      toast('Saved')
    }
  }
  return (
    <section className="card panel">
      <h3>Free cancellation</h3>
      <p className="muted small">Families can cancel by themselves until:</p>
      <div className="seg">
        {[12, 24, 48].map((h) => (
          <button key={h} className={settings.cancel_hours === h ? 'on' : ''} onClick={() => change(h)}>
            {h} h before
          </button>
        ))}
      </div>
    </section>
  )
}

/* ---------- Apple Calendar subscription ---------- */

function AppleCalendar() {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('ics_token')
      .maybeSingle()
      .then(({ data }) => setToken(data?.ics_token ?? null))
  }, [])

  const host = new URL(import.meta.env.VITE_SUPABASE_URL as string).host
  const link = token ? `webcal://${host}/functions/v1/calendar-feed?token=${token}` : ''

  return (
    <section className="card panel">
      <h3>Apple Calendar</h3>
      <p className="muted small">Subscribe once and all booked lessons appear in your calendar app.</p>
      {token ? (
        <>
          <input className="linkbox" readOnly value={link} onFocus={(e) => e.target.select()} />
          <div className="srow" style={{ marginTop: 10 }}>
            <button className="btn sm primary" onClick={async () => toast((await copyText(link)) ? 'Link copied' : 'Could not copy. Select the link and copy it.')}>
              Copy link
            </button>
            <a className="btn sm" href={link}>Open in Calendar</a>
            <button className="btn sm ghost" onClick={() => setConfirm(true)}>New link</button>
          </div>
          <details className="howto" open>
            <summary>How to add it</summary>
            <p>
              <b>Easiest, on your iPhone or Mac:</b> open this page there and tap <b>Open in Calendar</b>. The Calendar app asks
              “Subscribe to this calendar?” → tap <b>Subscribe</b> → <b>Add</b>.
            </p>
            <p>
              <b>If that doesn't open:</b> tap <b>Copy link</b>, then on iPhone: Settings → Apps → Calendar → Calendar Accounts → Add Account → Other →
              Add Subscribed Calendar → paste → Next → Save. On Mac: Calendar → File → New Calendar Subscription → paste → set Auto-refresh to
              “Every 5 minutes”.
            </p>
            <p>Apple refreshes subscribed calendars with a delay. For instant news you get the emails.</p>
          </details>
        </>
      ) : (
        <p className="muted small">Loading …</p>
      )}
      {confirm && (
        <ConfirmDialog
          title="Create a new link?"
          text="The old link stops working. You need to subscribe again with the new link."
          okLabel="New link"
          danger
          onOk={async () => {
            const { data, error } = await supabase.rpc('regenerate_ics_token')
            if (error) toast('Could not create a new link.')
            else {
              setToken(data as string)
              toast('New link created')
            }
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  )
}
