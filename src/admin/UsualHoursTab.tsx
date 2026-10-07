import { useState } from 'react'
import { supabase } from '../supabase'
import { WD_LONG, WD_SHORT, WEEK_ORDER, tzName } from '../lib/time'
import { Modal, useToast } from '../lib/ui'
import TimeGrid from './TimeGrid'
import { useAvailability, type Settings } from './availability'

export default function UsualHoursTab({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const toast = useToast()
  const { template, saveTemplateDay, error, reload } = useAvailability()
  const [menuDay, setMenuDay] = useState<number | null>(null)

  if (error) {
    return (
      <div className="card placeholder">
        Could not load your hours. <button className="btn sm" onClick={reload}>Try again</button>
      </div>
    )
  }
  if (!template) return <p className="muted">Loading …</p>

  async function commit(changes: Record<string, number[]>) {
    const results = await Promise.all(Object.entries(changes).map(([wd, slots]) => saveTemplateDay(Number(wd), slots)))
    toast(results.every(Boolean) ? 'Saved' : 'Could not save. Please try again.')
  }

  async function changeCancelHours(hours: number) {
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
    <>
      <div className="edithint">
        <p>
          Your normal week. These hours apply automatically every week. Tap or drag to open or block times. You change single weeks in
          the calendar with “Edit hours”. All times are {tzName(settings.timezone)} time.
        </p>
      </div>
      <TimeGrid
        edit
        onCommit={commit}
        columns={WEEK_ORDER.map((wd) => ({
          key: String(wd),
          head: <div className="dn">{WD_SHORT[wd]}</div>,
          onHeadClick: () => setMenuDay(wd),
          slots: template[wd],
        }))}
      />
      <div className="card panel" style={{ marginTop: 16 }}>
        <h3>Cancellations</h3>
        <p className="muted small">Until when can families cancel for free by themselves?</p>
        <select className="inp" value={settings.cancel_hours} onChange={(e) => changeCancelHours(Number(e.target.value))}>
          {[12, 24, 48].map((h) => (
            <option key={h} value={h}>{h} hours before</option>
          ))}
        </select>
      </div>

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
    </>
  )
}
