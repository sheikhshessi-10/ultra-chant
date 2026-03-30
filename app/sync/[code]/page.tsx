'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, Room } from '@/lib/supabase'
import { playOleChant, requestWakeLock, releaseWakeLock } from '@/lib/audio'

export default function SyncPage() {
  const params = useParams()
  const router = useRouter()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [phase, setPhase] = useState<'chanting' | 'done'>('chanting')
  const [isFlashing, setIsFlashing] = useState(true)

  useEffect(() => {
    requestWakeLock()
    loadAndPlay()
    return () => releaseWakeLock()
  }, [])

  async function loadAndPlay() {
    const { data } = await supabase.from('rooms').select('*').eq('code', code).single()
    const r = data as Room | null
    if (r) {
      setRoom(r)
      if (typeof document !== 'undefined') document.title = r.chant_text
      playOleChant(r.chant_audio_url, r.chant_text)
    } else {
      playOleChant(null, 'Ole Ole Ole')
    }

    // Stop flash after 2s
    setTimeout(() => setIsFlashing(false), 2000)

    // Show done screen after chant duration
    const duration = r?.chant_duration_secs || 12
    setTimeout(() => setPhase('done'), duration * 1000)
  }

  async function backToRoom() {
    // Reset room for next chant
    await supabase.from('rooms')
      .update({ status: 'waiting', launch_at: null })
      .eq('code', code)
    router.push(`/room/${code}`)
  }

  if (phase === 'done') {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">&#x1F525;</div>
          <p className="text-white font-black text-3xl mb-2">That was electric</p>
          <p className="text-gray-500 mb-10">Room: {code}</p>
          <button
            onClick={backToRoom}
            className="px-8 py-4 bg-[#FF4D00] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
          >
            Back to Room
          </button>
        </div>
      </main>
    )
  }

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center px-6 transition-colors duration-300 ${
        isFlashing ? 'bg-[#FF4D00]' : 'bg-[#0D0D0D]'
      }`}
    >
      <div className="text-center slide-up">
        <p className={`text-6xl sm:text-8xl font-black uppercase leading-tight tracking-tight transition-colors duration-300 pulse-glow ${
          isFlashing ? 'text-white' : 'text-[#FF4D00]'
        }`}>
          {room?.chant_text || 'Ole Ole Ole'}
        </p>
      </div>
    </main>
  )
}
