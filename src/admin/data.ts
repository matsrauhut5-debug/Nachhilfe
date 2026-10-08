import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { zonedParts } from '../lib/time'

export type FamilyLite = {
  id: string
  student_name: string | null
  color: string | null
  active: boolean
  price_60: number | null
  price_90: number | null
  price_120: number | null
}

export type Booking = {
  id: string
  family_id: string
  starts_at: string
  ends_at: string
  duration_min: number
  series_id: string | null
  status: 'booked' | 'cancelled' | 'late'
  price: number
  paid: boolean
}

// A booking placed on the admin's calendar (date + minutes in the admin's time zone)
export type Placed = Booking & { iso: string; start: number; end: number }

export const BOOKING_COLS = 'id, family_id, starts_at, ends_at, duration_min, series_id, status, price, paid'

export function place(b: Booking, tz: string): Placed {
  const s = zonedParts(new Date(b.starts_at), tz)
  const e = zonedParts(new Date(b.ends_at), tz)
  return { ...b, iso: s.iso, start: s.min, end: e.iso === s.iso ? e.min : 1440 }
}

export function useFamilies() {
  const [families, setFamilies] = useState<Record<string, FamilyLite>>({})
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, student_name, color, active, price_60, price_90, price_120')
      .eq('role', 'family')
      .order('student_name')
    if (data) setFamilies(Object.fromEntries((data as FamilyLite[]).map((f) => [f.id, f])))
  }, [])
  useEffect(() => {
    load()
  }, [load])
  return families
}

export function firstName(f: FamilyLite | undefined) {
  return (f?.student_name ?? 'Student').split(' ')[0]
}
