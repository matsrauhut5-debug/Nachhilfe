import { Link } from 'react-router-dom'

// Short privacy notice. Mats should confirm which data protection law applies to him.
export default function PrivacyPage() {
  return (
    <article className="card panel privacy">
      <h1>Privacy</h1>
      <p className="muted small">How this booking page handles your data.</p>

      <h2>Who is responsible</h2>
      <p>Mats, the tutor who runs this booking page. You can reach him at the email address that sent your invitation.</p>

      <h2>What we store</h2>
      <ul>
        <li>Student name, an optional username and the email address used to sign in</li>
        <li>Booked and cancelled lessons with date, time, length and price</li>
        <li>Whether a lesson has been paid</li>
      </ul>
      <p>Your password is stored encrypted by our login provider; nobody, including Mats, can read it.</p>

      <h2>What it is used for</h2>
      <p>Only to organise lessons: booking, cancelling, confirmation emails and keeping track of payments. Nothing is sold or used for advertising.</p>

      <h2>Where it is stored</h2>
      <ul>
        <li>Database and sign-in: Supabase, servers in the EU (Ireland)</li>
        <li>Emails: sent through Google Gmail</li>
        <li>This website: GitHub Pages (no data is stored there)</li>
        <li>Once a month Mats gets a payment overview (name, amount, date, paid or not) in his email account</li>
      </ul>

      <h2>How long</h2>
      <p>As long as you take lessons. When you stop, ask Mats and he deletes your account and lessons, except where records must be kept for accounting.</p>

      <h2>Your rights</h2>
      <p>You can ask Mats at any time which data is stored about you, and ask him to correct or delete it.</p>

      <p className="fine" style={{ marginTop: 20 }}>
        <Link to="/">Back</Link>
      </p>
    </article>
  )
}
