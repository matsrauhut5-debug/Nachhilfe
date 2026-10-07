import { useState } from 'react'
import UserMenu from '../auth/UserMenu'
import StudentsTab from './StudentsTab'

const TABS = [
  ['cal', 'Calendar'],
  ['tpl', 'Usual hours'],
  ['stud', 'Students & prices'],
  ['pay', 'Payments'],
] as const

type Tab = (typeof TABS)[number][0]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('cal')
  const label = TABS.find(([id]) => id === tab)![1]

  return (
    <>
      <UserMenu />
      <header className="head">
        <h1>Overview</h1>
        <p>Lessons, your hours, prices and payments in one place.</p>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map(([id, text]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {text}
          </button>
        ))}
      </nav>
      {tab === 'stud' ? (
        <StudentsTab />
      ) : (
        <div className="card placeholder">“{label}” will be built in one of the next phases.</div>
      )}
    </>
  )
}
