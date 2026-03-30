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
export async function getServerTimeOffset(): Promise<number> {
  const clientBefore = Date.now()
  const { data, error } = await supabase.rpc('get_server_time')
  const clientAfter = Date.now()
  if (error || !data) return 0
  const serverTime = new Date(data).getTime()
  const clientMid = (clientBefore + clientAfter) / 2
  return serverTime - clientMid
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
