import UserMenu from '../auth/UserMenu'

export default function FamilyPage() {
  return (
    <>
      <UserMenu />
      <header className="head">
        <h1>Tutoring with Mats</h1>
        <p>Tap a free time to book a lesson.</p>
      </header>
      <div className="card placeholder">Free times will appear here soon.</div>
    </>
  )
}
