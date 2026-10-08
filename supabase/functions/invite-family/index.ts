// Admin-only actions on family accounts that need the service role:
// invite, resend, deactivate, activate, delete.
import { createClient } from 'npm:@supabase/supabase-js@2'

const PALETTE = ['#0E8A5F', '#3F6FA8', '#8C6A3F', '#6A5D8F', '#3F7F7B', '#8E5A5A']
const BAN_FOREVER = '876000h' // ~100 years

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function fail(message: string, status = 400) {
  return reply({ error: message }, status)
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function price(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/
const USERNAME_HINT = 'Usernames need 3–30 characters: lowercase letters, numbers, dot, dash or underscore.'

async function nextColor(): Promise<string> {
  const { data } = await admin.from('profiles').select('color').eq('role', 'family')
  const used = new Map<string, number>()
  for (const row of data ?? []) if (row.color) used.set(row.color, (used.get(row.color) ?? 0) + 1)
  // least-used colour first, palette order breaks ties
  return [...PALETTE].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0]
}

async function getFamily(id: unknown) {
  if (typeof id !== 'string') return null
  const { data } = await admin.from('profiles').select('id, email, role, username').eq('id', id).maybeSingle()
  return data?.role === 'family' ? data : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  // Caller must be the signed-in admin
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(token)
  if (!userData.user) return fail('Not signed in', 401)
  const { data: caller } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle()
  if (caller?.role !== 'admin') return fail('Not allowed', 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request')
  }

  switch (body.action) {
    case 'invite': {
      const email = String(body.email ?? '').trim().toLowerCase()
      const studentName = String(body.student_name ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.')
      if (!studentName) return fail("Please enter the student's name.")
      const username = String(body.username ?? '').trim().toLowerCase() || null
      if (username && !USERNAME_RE.test(username)) return fail(USERNAME_HINT)

      const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
      if (existing) return fail('There is already an account with this email address.')
      if (username) {
        const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
        if (taken) return fail('This username is already taken.')
      }

      // username is shown in the invitation email via {{ .Data.username }}
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { username } })
      if (error || !invited.user) return fail(`The invitation could not be sent: ${error?.message ?? 'unknown error'}`, 502)

      // The profile row was created by the on_auth_user_created trigger
      const { error: upErr } = await admin
        .from('profiles')
        .update({
          student_name: studentName,
          username,
          price_60: price(body.price_60),
          price_90: price(body.price_90),
          price_120: price(body.price_120),
          timezone: String(body.timezone ?? '') || 'Asia/Hong_Kong',
          color: await nextColor(),
        })
        .eq('id', invited.user.id)
      if (upErr) return fail(`Invitation sent, but saving the details failed: ${upErr.message}`, 500)
      return reply({ ok: true, id: invited.user.id })
    }

    case 'resend': {
      const fam = await getFamily(body.id)
      if (!fam) return fail('Family not found.', 404)
      const { data: u } = await admin.auth.admin.getUserById(fam.id)
      // Never signed in → send the invitation again; otherwise a password reset link
      const { error } = u.user?.last_sign_in_at
        ? await admin.auth.resetPasswordForEmail(fam.email)
        : await admin.auth.admin.inviteUserByEmail(fam.email, { data: { username: fam.username } })
      if (error) return fail(`The email could not be sent: ${error.message}`, 502)
      return reply({ ok: true, kind: u.user?.last_sign_in_at ? 'reset' : 'invite' })
    }

    case 'deactivate':
    case 'activate': {
      const fam = await getFamily(body.id)
      if (!fam) return fail('Family not found.', 404)
      const active = body.action === 'activate'
      const { error } = await admin.auth.admin.updateUserById(fam.id, { ban_duration: active ? 'none' : BAN_FOREVER })
      if (error) return fail(error.message, 500)
      await admin.from('profiles').update({ active }).eq('id', fam.id)
      return reply({ ok: true })
    }

    case 'delete': {
      const fam = await getFamily(body.id)
      if (!fam) return fail('Family not found.', 404)
      const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true }).eq('family_id', fam.id)
      if (count) return fail('This family already has lessons and can only be deactivated.', 409)
      const { error } = await admin.auth.admin.deleteUser(fam.id) // profile row is removed by cascade
      if (error) return fail(error.message, 500)
      return reply({ ok: true })
    }

    default:
      return fail('Unknown action')
  }
})
