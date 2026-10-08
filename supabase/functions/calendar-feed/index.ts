// iCalendar feed for Apple Calendar. Public URL, protected by the secret ?token=.
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const DAY = 86_400_000

// 20261012T130000Z
function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Escape text values (RFC 5545 §3.3.11)
function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Lines longer than 75 octets are folded (RFC 5545 §3.1)
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

function hours(min: number) {
  return min === 60 ? '1 hr' : `${min / 60} hrs`
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const { data: settings } = await admin.from('settings').select('ics_token').eq('id', 1).maybeSingle()
  // constant answer for wrong tokens; never reveal whether a token exists
  if (!settings || token.length < 32 || token !== settings.ics_token) {
    return new Response('Not found', { status: 404 })
  }

  const now = Date.now()
  const [{ data: bookings }, { data: families }] = await Promise.all([
    admin
      .from('bookings')
      .select('id, family_id, starts_at, ends_at, duration_min, series_id, price, created_at')
      .eq('status', 'booked')
      .gte('starts_at', new Date(now - 30 * DAY).toISOString())
      .lte('starts_at', new Date(now + 180 * DAY).toISOString())
      .order('starts_at'),
    admin.from('profiles').select('id, student_name').eq('role', 'family'),
  ])
  const names = new Map((families ?? []).map((f) => [f.id, f.student_name ?? 'Student']))
  const stamp = icsDate(new Date().toISOString())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tutoring with Mats//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Tutoring',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ]
  for (const b of bookings ?? []) {
    const desc = `${hours(b.duration_min)} · HK$ ${Number(b.price)}${b.series_id ? ' · weekly series' : ''}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@tutoring-mats`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(b.starts_at)}`,
      `DTEND:${icsDate(b.ends_at)}`,
      fold(`SUMMARY:${esc(`Tutoring: ${names.get(b.family_id) ?? 'Student'}`)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tutoring.ics"',
      'Cache-Control': 'no-cache',
    },
  })
})
