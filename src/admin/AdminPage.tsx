import { useState } from 'react'
import UserMenu from '../auth/UserMenu'
import StudentsTab from './StudentsTab'
import UsualHoursTab from './UsualHoursTab'
import CalendarTab from './CalendarTab'
import { useSettings } from './availability'

const TABS = [
  ['cal', 'Calendar'],
  ['tpl', 'Usual hours'],
  ['stud', 'Students & prices'],
  ['pay', 'Payments'],
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
  return 'cal'
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const { settings, setSettings, error, reload } = useSettings()
  const label = TABS.find(([id]) => id === tab)![1]

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
  else if (tab === 'cal') content = <CalendarTab settings={settings} />
  else if (tab === 'tpl') content = <UsualHoursTab settings={settings} onSettings={setSettings} />
  else content = <div className="card placeholder">“{label}” will be built in one of the next phases.</div>

  return (
    <>
      <UserMenu />
      <header className="head">
        <h1>Overview</h1>
        <p>Lessons, your hours, prices and payments in one place.</p>
      </header>
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
