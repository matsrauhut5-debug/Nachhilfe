// Weekly backup: all data as JSON + bookings as CSV, emailed to Mats.
// Called by the GitHub Action every Sunday; protected by the x-backup-secret header.
// The backup is never stored in the (public) repository.
import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BOOKING_COLS = [
  'id', 'family_id', 'starts_at', 'ends_at', 'duration_min', 'series_id', 'status', 'cancel_reason',
  'price', 'paid', 'created_at', 'cancelled_at',
]

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('BACKUP_SECRET')
  if (!secret || req.headers.get('x-backup-secret') !== secret) return new Response('Forbidden', { status: 403 })

  const [profiles, bookings, template, overrides, settings] = await Promise.all([
    admin.from('profiles').select('*').order('created_at'),
    admin.from('bookings').select('*').order('starts_at'),
    admin.from('availability_template').select('*').order('weekday'),
    admin.from('availability_override').select('*').order('date'),
    // without ics_token (the calendar link secret)
    admin.from('settings').select('cancel_hours, timezone, second_timezone, admin_email').eq('id', 1).maybeSingle(),
  ])
  const failed = [profiles, bookings, template, overrides, settings].find((r) => r.error)
  if (failed || !settings.data) return new Response(`Export failed: ${failed?.error?.message ?? 'no settings'}`, { status: 500 })

  const stamp = new Date().toISOString().slice(0, 10)
  const json = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      profiles: profiles.data,
      bookings: bookings.data,
      availability_template: template.data,
      availability_override: overrides.data,
      settings: settings.data,
    },
    null,
    2,
  )
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.student_name ?? p.email]))
  const csv = [['student', ...BOOKING_COLS].join(',')]
    .concat((bookings.data ?? []).map((b) => [names.get(b.family_id), ...BOOKING_COLS.map((c) => b[c])].map(csvCell).join(',')))
    .join('\n')

  const user = Deno.env.get('GMAIL_USER') ?? settings.data.admin_email
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')
  if (!pass) return new Response('GMAIL_APP_PASSWORD is not set', { status: 500 })

  const active = (bookings.data ?? []).filter((b) => b.status === 'booked' && new Date(b.starts_at) > new Date()).length
  await nodemailer
    .createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
    .sendMail({
      from: `"Nachhilfe Mats" <${user}>`,
      to: settings.data.admin_email,
      subject: `Weekly backup ${stamp}`,
      text:
        `Your weekly backup is attached.\n\n` +
        `${(profiles.data ?? []).filter((p) => p.role === 'family').length} students · ${(bookings.data ?? []).length} bookings in total · ${active} upcoming lessons.\n\n` +
        `Keep this email: it contains everything needed to restore the data.`,
      attachments: [
        { filename: `tutoring-backup-${stamp}.json`, content: json, contentType: 'application/json' },
        { filename: `tutoring-bookings-${stamp}.csv`, content: csv, contentType: 'text/csv' },
      ],
    })

  return new Response('Backup sent')
})
