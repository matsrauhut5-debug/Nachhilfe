import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../supabase'

// Calls an Edge Function and turns its { error } reply into a readable message.
export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data as T
  if (error instanceof FunctionsHttpError) {
    const reply = await error.context.json().catch(() => null)
    if (reply?.error) throw new Error(reply.error)
  }
  throw new Error('That didn\'t work. Check your internet connection and try again.')
}
