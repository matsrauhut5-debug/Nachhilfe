// Monthly payment overview: one CSV row per lesson of last month (Name, Betrag, Datum, Status),
// emailed to Mats on the 1st of each month. Same columns as his Google Sheet.
// Called by the GitHub Action; protected by the x-report-secret header.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// The instant at which the clock in `tz` shows midnight of y-m-d (m 1-based, may overflow)
function zonedMidnight(y: number, m: number, d: number, tz: string) {
  const wanted = Date.UTC(y, m - 1, d)
  let guess = wanted
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]))
    const diff = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wanted
    if (diff === 0) break
    guess -= diff
  }
  return new Date(guess)
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('REPORT_SECRET')
  if (!secret || req.headers.get('x-report-secret') !== secret) return new Response('Forbidden', { status: 403 })

  const { data: settings } = await admin.from('settings').select('admin_email, timezone').eq('id', 1).maybeSingle()
  if (!settings) return new Response('No settings', { status: 500 })
  const tz = settings.timezone

  // Last month in Mats' time zone (optional ?month=2026-09 for a specific month)
  const param = new URL(req.url).searchParams.get('month')
  const nowParts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const ny = Number(nowParts.find((p) => p.type === 'year')!.value)
  const nm = Number(nowParts.find((p) => p.type === 'month')!.value)
  const [y, m] = param && /^\d{4}-\d{2}$/.test(param) ? param.split('-').map(Number) : nm === 1 ? [ny - 1, 12] : [ny, nm - 1]
  const from = zonedMidnight(y, m, 1, tz)
  const to = zonedMidnight(y, m + 1, 1, tz)

  const [{ data: bookings, error }, { data: families }] = await Promise.all([
    admin
      .from('bookings')
      .select('family_id, starts_at, price, paid, status')
      .in('status', ['booked', 'late'])
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at'),
    admin.from('profiles').select('id, student_name').eq('role', 'family'),
  ])
  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 })

  const names = new Map((families ?? []).map((f) => [f.id, f.student_name ?? 'Student']))
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }) // 13/08/2026
  const amount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

  const rows = (bookings ?? []).map((b) =>
    [names.get(b.family_id) ?? 'Former student', amount(Number(b.price)), date.format(new Date(b.starts_at)), b.paid ? 'Bezahlt' : 'Nicht bezahlt'],
  )
  const csv = [['Name', 'Betrag', 'Datum', 'Status'], ...rows].map((r) => r.map(csvCell).join(',')).join('\n')

  const sum = (paid: boolean) => (bookings ?? []).filter((b) => b.paid === paid).reduce((s, b) => s + Number(b.price), 0)
  const label = `${MONTHS[m - 1]} ${y}`

  const user = Deno.env.get('GMAIL_USER') ?? settings.admin_email
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')
  if (!pass) return new Response('GMAIL_APP_PASSWORD is not set', { status: 500 })

  await nodemailer
    .createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
    .sendMail({
      from: `"Nachhilfe Mats" <${user}>`,
      to: settings.admin_email,
      subject: `Payments ${label}`,
      text:
        `Your payment overview for ${label} is attached (${rows.length} lessons).\n\n` +
        `Paid: HK$ ${amount(sum(true))}\nNot paid yet: HK$ ${amount(sum(false))}\n\n` +
        `Open the CSV file or import it into Google Sheets (File → Import).`,
      attachments: [{ filename: `payments-${y}-${String(m).padStart(2, '0')}.csv`, content: '﻿' + csv, contentType: 'text/csv; charset=utf-8' }],
    })

  return new Response(`Report sent for ${label}`)
})
