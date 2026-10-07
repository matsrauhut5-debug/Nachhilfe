// Sign-in with a username instead of an email.
// Looks up the email server-side (never sent to the browser) and returns a normal session.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const WRONG = 'Username or password is incorrect.'
const DEACTIVATED = 'Your account has been deactivated. Please reach out to Mats.'

const url = Deno.env.get('SUPABASE_URL')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)

  let username = ''
  let password = ''
  try {
    const body = await req.json()
    username = String(body.username ?? '').trim().toLowerCase()
    password = String(body.password ?? '')
  } catch {
    return reply({ error: WRONG }, 400)
  }
  if (!username || !password) return reply({ error: WRONG }, 400)

  const { data: profile } = await admin.from('profiles').select('email').eq('username', username).maybeSingle()
  if (!profile) return reply({ error: WRONG }, 401)

  // Fresh client per request so sessions never mix between callers
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email: profile.email, password })
  if (error) {
    if (error.code === 'user_banned') return reply({ error: DEACTIVATED }, 403)
    if (error.code === 'invalid_credentials') return reply({ error: WRONG }, 401)
    return reply({ error: 'Sign-in didn\'t work. Please try again in a moment.' }, 502)
  }

  return reply({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
