import type { PostgrestError } from '@supabase/supabase-js'

// Messages raised by our database functions are written for users; anything else gets a generic text.
export function rpcMessage(error: PostgrestError | null) {
  if (!error) return null
  if (error.code === 'P0001' || error.code === '42501') return error.message
  return 'That didn\'t work. Check your internet connection and try again.'
}
