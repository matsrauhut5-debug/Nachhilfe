import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../lib/ui'

type Prefs = { notify_bookings: boolean; notify_cancellations: boolean; notify_report: boolean }

const LABELS: [keyof Prefs, string, string][] = [
  ['notify_bookings', 'Bookings', 'When a lesson or series is booked'],
  ['notify_cancellations', 'Cancellations', 'When a lesson is cancelled or a series ends'],
  ['notify_report', 'Monthly payment report', 'CSV of last month on the 1st'],
]

// Email on/off switches for the signed-in account. `withReport` only for the admin.
export default function EmailPrefs({ withReport = false }: { withReport?: boolean }) {
  const toast = useToast()
  const [prefs, setPrefs] = useState<Prefs | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase
        .from('profiles')
        .select('notify_bookings, notify_cancellations, notify_report')
        .eq('id', data.user.id)
        .single()
        .then(({ data: p }) => p && setPrefs(p as Prefs))
    })
  }, [])

  async function change(key: keyof Prefs, value: boolean) {
    if (!prefs) return
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    const { error } = await supabase.rpc('set_email_prefs', {
      p_bookings: next.notify_bookings,
      p_cancellations: next.notify_cancellations,
      p_report: withReport ? next.notify_report : null,
    })
    if (error) {
      setPrefs(prefs)
      toast('Could not save. Please try again.')
    } else {
      toast(value ? 'Emails switched on' : 'Emails switched off')
    }
  }

  if (!prefs) return <p className="muted small">Loading …</p>

  return (
    <div className="prefs">
      {LABELS.filter(([k]) => withReport || k !== 'notify_report').map(([k, label, hint]) => (
        <label key={k} className="switch">
          <span>
            {label}
            <small>{hint}</small>
          </span>
          <input type="checkbox" checked={prefs[k]} onChange={(e) => change(k, e.target.checked)} />
        </label>
      ))}
    </div>
  )
}
