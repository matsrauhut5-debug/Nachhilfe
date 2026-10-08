import { useState } from 'react'
import UserMenu from '../auth/UserMenu'
import WeekTab from './WeekTab'
import StudentsTab from './StudentsTab'
import PaymentsTab from './PaymentsTab'
import SettingsTab from './SettingsTab'
import { useSettings } from './availability'

const TABS = [
  ['week', 'Week'],
  ['stud', 'Students'],
  ['pay', 'Payments'],
  ['set', 'Settings'],
] as const

type Tab = (typeof TABS)[number][0]

const TAB_KEY = 'nh_admin_tab'

function initialTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    if (TABS.some(([id]) => id === t)) return t as Tab
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'week'
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const { settings, setSettings, error, reload } = useSettings()

  function choose(t: Tab) {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // ignore
    }
  }

  let content
  if (tab === 'stud') content = <StudentsTab />
  else if (error) content = <div className="card placeholder">Could not load settings. <button className="btn sm" onClick={reload}>Try again</button></div>
  else if (!settings) content = <p className="muted">Loading …</p>
  else if (tab === 'week') content = <WeekTab settings={settings} />
  else if (tab === 'pay') content = <PaymentsTab settings={settings} />
  else content = <SettingsTab settings={settings} onSettings={setSettings} />

  return (
    <>
      <div className="adminbar">
        <span className="brand">Tutoring</span>
        <UserMenu />
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map(([id, text]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => choose(id)}>
            {text}
          </button>
        ))}
      </nav>
      {content}
    </>
  )
}
