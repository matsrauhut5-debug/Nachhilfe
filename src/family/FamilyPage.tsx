import UserMenu from '../auth/UserMenu'

export default function FamilyPage() {
  return (
    <>
      <UserMenu />
      <header className="head">
        <h1>Nachhilfe bei Mats</h1>
        <p>Tipp auf eine freie Uhrzeit, um einen Termin zu buchen.</p>
      </header>
      <div className="card placeholder">Hier erscheinen bald die freien Termine.</div>
    </>
  )
}
