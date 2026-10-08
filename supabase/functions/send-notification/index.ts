// Sends the booking/cancellation emails for one notifications_outbox row via Gmail (SMTP, port 465).
// Called by the database trigger on new outbox rows; protected by the x-webhook-secret header.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://matsrauhut5-debug.github.io/Nachhilfe/'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Payload = {
  starts?: string[]
  skipped?: string[]
  duration_min?: number
  price?: number
  kept?: number
  by?: 'family' | 'admin'
  reason?: 'teacher' | 'family'
  full_price?: number
}

const TZ_NAMES: Record<string, string> = { 'Europe/Berlin': 'German', 'Asia/Hong_Kong': 'Hong Kong' }
const tzName = (tz: string) => TZ_NAMES[tz] ?? tz.split('/').pop()!.replace(/_/g, ' ')

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(new Date(iso))
}
// "Mon 12 Oct, 15:00–16:30"
function when(start: string, durMin: number, tz: string) {
  const end = new Date(new Date(start).getTime() + durMin * 60_000).toISOString()
  const day = fmt(start, tz, { weekday: 'short', day: 'numeric', month: 'short' })
  const t = (iso: string) => fmt(iso, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day}, ${t(start)}–${t(end)}`
}
const dayOnly = (iso: string, tz: string) => fmt(iso, tz, { weekday: 'short', day: 'numeric', month: 'short' })
const hrs = (m: number) => (m === 60 ? '1 hr' : `${m / 60} hrs`)
const money = (n: number) => 'HK$ ' + new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n)

function html(lines: string[], button?: string) {
  const body = lines.map((l) => (l === '' ? '<br>' : `<p style="margin:0 0 10px">${l}</p>`)).join('')
  const btn = button
    ? `<p style="margin:22px 0"><a href="${APP_URL}" style="background:#0E8A5F;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;display:inline-block">${button}</a></p>`
    : ''
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E2340;line-height:1.5">
<h2 style="font-family:Georgia,serif;font-weight:500;margin:0 0 14px">Tutoring with Mats</h2>${body}${btn}</div>`
}

const list = (items: string[]) => `<ul style="margin:0 0 10px;padding-left:20px">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`

type Mail = { to: string; subject: string; html: string }

const BOOKING_KINDS = ['booked', 'series_booked']

function compose(kind: string, p: Payload, fam: { email: string; student_name: string | null; timezone: string }, adminTz: string, cancelHours: number) {
  const name = fam.student_name ?? 'Student'
  const first = name.split(' ')[0]
  const ftz = fam.timezone
  const starts = p.starts ?? []
  const dur = p.duration_min ?? 60
  const fTime = `(${tzName(ftz)} time)`
  const aTime = `(${tzName(adminTz)} time)`
  const byMats = p.by === 'admin'
  // Why Mats cancelled: he can't make it, or the family asked (e.g. via WhatsApp)
  const matsCant = byMats && p.reason === 'teacher'
  const who = byMats ? 'You' : name
  const reasonNote = byMats ? (matsCant ? ' (you couldn\'t make it)' : ' (family\'s request)') : ''
  const mails: Mail[] = []
  const toMats = (subject: string, lines: string[]) => mails.push({ to: '', subject, html: html(lines, 'Open overview') })

  if (kind === 'booked' || kind === 'series_booked') {
    const one = starts.length === 1
    const famLines = one
      ? [`Hello,`, `${first}'s lesson is booked:`, `<b>${when(starts[0], dur, ftz)}</b> ${fTime}`, `${hrs(dur)} · ${money(p.price ?? 0)}`]
      : [`Hello,`, `${starts.length} weekly lessons for ${first} are booked ${fTime}:`, list(starts.map((s) => when(s, dur, ftz))), `${hrs(dur)} each · ${money(p.price ?? 0)} per lesson`]
    if (p.skipped?.length) famLines.push(`Not free, so skipped: ${p.skipped.map((s) => dayOnly(s, ftz)).join(', ')}`)
    famLines.push('', `You can cancel for free up to ${cancelHours} hours before a lesson.`)
    mails.push({
      to: fam.email,
      subject: one ? `Lesson booked: ${when(starts[0], dur, ftz)}` : `${starts.length} lessons booked for ${first}`,
      html: html(famLines, 'Open booking page'),
    })
    toMats(
      one ? `New booking: ${name}, ${when(starts[0], dur, adminTz)}` : `New series: ${name}, ${starts.length} lessons`,
      one
        ? [`${byMats ? `You booked a lesson for <b>${name}</b>` : `<b>${name}</b> booked a lesson`}: ${when(starts[0], dur, adminTz)} ${aTime}.`, `${hrs(dur)} · ${money(p.price ?? 0)}`]
        : [`${byMats ? `You booked ${starts.length} weekly lessons for <b>${name}</b>` : `<b>${name}</b> booked ${starts.length} weekly lessons`} ${aTime}:`, list(starts.map((s) => when(s, dur, adminTz))), `${hrs(dur)} · ${money(p.price ?? 0)} each`],
    )
  } else if (kind === 'cancelled') {
    const s = starts[0]
    const famText = !byMats
      ? `You cancelled ${first}'s lesson on <b>${when(s, dur, ftz)}</b> ${fTime}.`
      : matsCant
        ? `Unfortunately Mats has to cancel ${first}'s lesson on <b>${when(s, dur, ftz)}</b> ${fTime}. Sorry for the change.`
        : `As requested, Mats cancelled ${first}'s lesson on <b>${when(s, dur, ftz)}</b> ${fTime}.`
    mails.push({ to: fam.email, subject: `Lesson cancelled: ${when(s, dur, ftz)}`, html: html([`Hello,`, famText, 'Nothing is charged for this lesson.'], 'Open booking page') })
    toMats(`Cancelled: ${name}, ${when(s, dur, adminTz)}`, [
      `${who} cancelled ${byMats ? `<b>${name}</b>'s lesson` : 'the lesson'} on ${when(s, dur, adminTz)} ${aTime}${reasonNote}. The time is free again.`,
    ])
  } else if (kind === 'series_ended') {
    const kept = p.kept ? `<br>${p.kept} lesson(s) were too soon to cancel and stay booked.` : ''
    const famText = !byMats ? `You ended ${first}'s weekly lessons.` : matsCant ? `Unfortunately Mats has to end ${first}'s weekly lessons.` : `As requested, Mats ended ${first}'s weekly lessons.`
    mails.push({
      to: fam.email,
      subject: `Series ended: ${starts.length} lessons cancelled`,
      html: html([`Hello,`, `${famText} These lessons are cancelled ${fTime}:`, list(starts.map((s) => dayOnly(s, ftz))) + kept], 'Open booking page'),
    })
    toMats(`Series ended: ${name}, ${starts.length} lessons cancelled`, [
      `${who} ended ${byMats ? `<b>${name}</b>'s` : 'the'} weekly series${reasonNote}. Cancelled ${aTime}:`,
      list(starts.map((s) => dayOnly(s, adminTz))) + kept,
    ])
  } else if (kind === 'late_cancelled') {
    const s = starts[0]
    const fee = money(p.price ?? 0)
    const famText = byMats
      ? `${first}'s lesson on <b>${when(s, dur, ftz)}</b> ${fTime} is cancelled at short notice.`
      : `You cancelled ${first}'s lesson on <b>${when(s, dur, ftz)}</b> ${fTime}.`
    mails.push({
      to: fam.email,
      subject: `Lesson cancelled at short notice: ${when(s, dur, ftz)}`,
      html: html([`Hello,`, famText, `Because it was less than ${cancelHours} hours before the lesson, 50 % is charged: <b>${fee}</b>.`], 'Open booking page'),
    })
    toMats(`Late cancellation: ${name}, ${when(s, dur, adminTz)}`, [
      `${byMats ? `You marked <b>${name}</b>'s lesson` : `<b>${name}</b> cancelled the lesson`} on ${when(s, dur, adminTz)} ${aTime} at short notice.`,
      `50 % is charged: ${fee} (stays in Payments). The time is free again.`,
    ])
  }
  return mails
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('WEBHOOK_SECRET')
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('Forbidden', { status: 403 })

  let id: number
  try {
    id = Number((await req.json()).id)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { data: row } = await admin.from('notifications_outbox').select('*').eq('id', id).maybeSingle()
  if (!row || row.sent_at) return new Response('Nothing to do')

  const [{ data: fam }, { data: settings }] = await Promise.all([
    admin.from('profiles').select('email, student_name, timezone, notify_bookings, notify_cancellations').eq('id', row.family_id).maybeSingle(),
    admin.from('settings').select('admin_email, timezone, cancel_hours').eq('id', 1).maybeSingle(),
  ])
  const { data: me } = await admin.from('profiles').select('notify_bookings, notify_cancellations').eq('role', 'admin').limit(1).maybeSingle()

  try {
    if (!fam || !settings) throw new Error('Family or settings not found')
    const user = Deno.env.get('GMAIL_USER') ?? settings.admin_email
    const pass = Deno.env.get('GMAIL_APP_PASSWORD')
    if (!pass) throw new Error('GMAIL_APP_PASSWORD is not set')

    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
    // Respect each person's email settings (to = '' means the mail for Mats)
    const isBooking = BOOKING_KINDS.includes(row.kind)
    const wants = (forFamily: boolean) => {
      const p = forFamily ? fam : me
      if (!p) return true
      return isBooking ? p.notify_bookings : p.notify_cancellations
    }
    const mails = compose(row.kind, row.payload as Payload, fam, settings.timezone, settings.cancel_hours).filter((m) => wants(m.to !== ''))
    for (const m of mails) {
      await transport.sendMail({
        from: `"Nachhilfe Mats" <${user}>`,
        to: m.to || settings.admin_email,
        replyTo: m.to ? settings.admin_email : undefined,
        subject: m.subject,
        html: m.html,
      })
    }
    await admin.from('notifications_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', id)
    return new Response('Sent')
  } catch (e) {
    await admin.from('notifications_outbox').update({ error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', id)
    return new Response('Failed', { status: 500 })
  }
})
