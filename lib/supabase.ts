import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

// Get server time offset: returns (serverTime - clientTime) in ms
// Samples 3 times and uses the median to reduce network jitter
export async function getServerTimeOffset(): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    const before = Date.now()
    const { data } = await supabase.rpc('get_server_time')
    const after = Date.now()
    if (data) {
      const roundTrip = after - before
      const serverTime = new Date(data).getTime()
      // Estimate server time at midpoint of request
      samples.push(serverTime + roundTrip / 2 - after)
    }
  }
  if (samples.length === 0) return 0
  // Use median to reject outliers
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

// Generate a random 6-char code like ULTRA42
export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'U'
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
