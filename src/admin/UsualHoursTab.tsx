import { useState } from 'react'
import { supabase } from '../supabase'
import { WD_LONG, WD_SHORT, WEEK_ORDER, fmtOffset, tzName, tzOffsetMin, tzShort } from '../lib/time'
import { Modal, useToast } from '../lib/ui'
import TimeGrid from './TimeGrid'
import { useAvailability, type Settings } from './availability'

export default function UsualHoursTab({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
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
      {edit ? (
        <div className="edithint">
          <p>Tap or drag to open or block times. Tap a weekday at the top to clear it. Changes are saved right away.</p>
          <button className="btn primary sm" onClick={() => setEdit(false)}>Done</button>
        </div>
      ) : (
        <div className="toolbar">
          <p className="muted small" style={{ margin: 0, flex: 1, minWidth: '14em' }}>
            Your normal week. These hours apply automatically every week. You change single weeks in the calendar.
          </p>
          <button className="btn sm" onClick={() => setEdit(true)}>Edit</button>
        </div>
      )}
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
        {tzName(settings.timezone)} time, with <b>{tzName(settings.second_timezone)} time</b> next to it ({fmtOffset(offset)} today). The
        difference changes by 1 hour when Germany switches between summer and winter time.
      </p>
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
