import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Legacy types (kept for /session routes backwards compat) ───────────────
export type Session = {
  id: string
  code: string
  leader_id: string
  chant_text: string
  audio_url: string | null
  status: 'building' | 'countdown' | 'live' | 'ended'
  launch_at: string | null
  created_at: string
}

export type Participant = {
  id: string
  session_id: string
  joined_at: string
}

// ─── MVP types ───────────────────────────────────────────────────────────────
export type Room = {
  id: string
  code: string
  venue_name: string
  venue_lat: number
  venue_lng: number
  section: string
  creator_id: string
  chant_text: string
  chant_audio_url: string | null
  countdown_audio_url: string | null
  status: 'waiting' | 'countdown' | 'ended'
  launch_at: string | null
  chant_duration_secs: number
  created_at: string
}

export type RoomFan = {
  id: string
  room_id: string
  fan_id: string
  joined_at: string
}

// ─── Fan identity ─────────────────────────────────────────────────────────────
export function getFanId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('ultra_fan_id')
  if (!id) {
    id = 'fan_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    localStorage.setItem('ultra_fan_id', id)
  }
  return id
}

// ─── Rooms helpers ────────────────────────────────────────────────────────────
export async function roomsNear(lat: number, lng: number): Promise<Room[]> {
  const radiusKm = parseFloat(process.env.NEXT_PUBLIC_RADIUS_KM || '8')
  const { data, error } = await supabase.rpc('rooms_near', { lat, lng, radius_km: radiusKm })
  if (error || !data) return []
  return data as Room[]
}

export async function joinRoom(roomId: string): Promise<void> {
  const fanId = getFanId()
  if (!fanId) return
  await supabase.from('room_fans').upsert(
    { room_id: roomId, fan_id: fanId },
    { onConflict: 'room_id,fan_id' }
  )
}

export async function leaveRoom(roomId: string): Promise<void> {
  const fanId = getFanId()
  if (!fanId) return
  await supabase.from('room_fans').delete()
    .eq('room_id', roomId)
    .eq('fan_id', fanId)
}

// ─── Time sync ────────────────────────────────────────────────────────────────
export async function getServerTimeOffset(): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    const before = Date.now()
    const { data } = await supabase.rpc('get_server_time')
    const after = Date.now()
    if (data) {
      const roundTrip = after - before
      const serverTime = new Date(data).getTime()
      samples.push(serverTime + roundTrip / 2 - after)
    }
  }
  if (samples.length === 0) return 0
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

// ─── Code generator ───────────────────────────────────────────────────────────
export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'U'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
