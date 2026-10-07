import { useState } from 'react'

const TABS = [
  ['cal', 'Kalender'],
  ['tpl', 'Standardzeiten'],
  ['stud', 'Schüler & Preise'],
  ['pay', 'Zahlungen'],
] as const

type Tab = (typeof TABS)[number][0]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('cal')
  const label = TABS.find(([id]) => id === tab)![1]

  return (
    <>
      <header className="head">
        <h1>Übersicht</h1>
        <p>Termine, deine Zeiten, Preise und Zahlungen an einem Ort.</p>
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
      <div className="card placeholder">„{label}“ wird in einer der nächsten Phasen gebaut.</div>
    </>
  )
}
