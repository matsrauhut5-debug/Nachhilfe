import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toSlots, toWindows, weekdayOf, type Window } from '../lib/time'

export type Settings = { timezone: string; second_timezone: string; cancel_hours: number }

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('settings').select('timezone, second_timezone, cancel_hours').maybeSingle()
    setError(!!error || !data)
    if (data) setSettings(data as Settings)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { settings, setSettings, error, reload: load }
}

// Usual hours (per weekday) and day overrides (per date) as 30-minute slots
export function useAvailability(from?: string, to?: string) {
  const [template, setTemplate] = useState<Record<number, number[]> | null>(null)
  const [overrides, setOverrides] = useState<Record<string, number[]>>({})
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const tplQ = supabase.from('availability_template').select('weekday, start_min, end_min')
    const ovQ = from && to ? supabase.from('availability_override').select('date, windows').gte('date', from).lte('date', to) : null
    const [tpl, ov] = await Promise.all([tplQ, ovQ])
    if (tpl.error || ov?.error) {
      setError(true)
      return
    }
    setError(false)
    const t: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    for (const r of tpl.data as { weekday: number; start_min: number; end_min: number }[]) {
      t[r.weekday].push(...toSlots([[r.start_min, r.end_min]]))
    }
    setTemplate(t)
    if (ov) {
      setOverrides(Object.fromEntries((ov.data as { date: string; windows: Window[] }[]).map((r) => [r.date, toSlots(r.windows)])))
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  function daySlots(iso: string) {
    return overrides[iso] ?? template?.[weekdayOf(iso)] ?? []
  }

  async function saveTemplateDay(weekday: number, slots: number[]) {
    setTemplate((t) => (t ? { ...t, [weekday]: slots } : t))
    const { error } = await supabase.rpc('set_template_day', { p_weekday: weekday, p_windows: toWindows(slots) })
    if (error) await load()
    return !error
  }

  // slots = null resets the day to the usual hours
  async function saveOverride(iso: string, slots: number[] | null) {
    setOverrides((o) => {
      const next = { ...o }
      if (slots === null) delete next[iso]
      else next[iso] = slots
      return next
    })
    const { error } = await supabase.rpc('set_override', { p_date: iso, p_windows: slots === null ? null : toWindows(slots) })
    // The database drops overrides that equal the usual hours; reload to reflect that
    await load()
    return !error
  }

  return { template, overrides, daySlots, saveTemplateDay, saveOverride, error, reload: load }
}
