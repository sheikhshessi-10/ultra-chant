'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, getFanId, joinRoom, leaveRoom, getServerTimeOffset, Room } from '@/lib/supabase'
import { playTick, speakNumber, requestWakeLock, releaseWakeLock } from '@/lib/audio'
import QRCodeDisplay from '@/components/QRCodeDisplay'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [fanCount, setFanCount] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [countdownSecs, setCountdownSecs] = useState(30)
  const [error, setError] = useState('')
  const [showQr, setShowQr] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const launchedRef = useRef(false)
  const prevCountRef = useRef<number | null>(null)
  const roomRef = useRef<Room | null>(null)
  const timeOffsetRef = useRef(0)

  useEffect(() => { roomRef.current = room }, [room])

  // Get server time offset once
  useEffect(() => {
    getServerTimeOffset().then(offset => { timeOffsetRef.current = offset })
  }, [])

  // Leave room on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) leaveRoom(roomRef.current.id)
      if (timerRef.current) clearInterval(timerRef.current)
      releaseWakeLock()
    }
  }, [])

  const startCountdown = useCallback((launchAt: string) => {
    if (timerRef.current) clearInterval(timerRef.current)
    requestWakeLock()
    timerRef.current = setInterval(() => {
      const now = Date.now() + timeOffsetRef.current
      const launch = new Date(launchAt).getTime()
      const remaining = Math.max(0, Math.ceil((launch - now) / 1000))
      setCountdown(remaining)

      if (prevCountRef.current !== remaining) {
        if (remaining > 0 && remaining <= 10) {
          playTick()
          speakNumber(remaining)
        }
        prevCountRef.current = remaining
      }

      if (remaining <= 1 && !launchedRef.current) {
        launchedRef.current = true
        const exactMs = Math.max(0, launch - (Date.now() + timeOffsetRef.current))
        setTimeout(() => {
          clearInterval(timerRef.current!)
          router.push(`/sync/${code}`)
        }, exactMs)
      }
    }, 100)
  }, [code, router])

  function handleRoomUpdate(r: Room) {
    if (r.status === 'countdown' && r.launch_at) {
      const now = Date.now() + timeOffsetRef.current
      const launch = new Date(r.launch_at).getTime()
      if (now >= launch) {
        if (!launchedRef.current) { launchedRef.current = true; router.push(`/sync/${code}`) }
      } else {
        startCountdown(r.launch_at)
      }
    } else if (r.status === 'ended') {
      router.push('/')
    }
  }

  useEffect(() => {
    async function load() {
      const { data, error: dbError } = await supabase
        .from('rooms').select('*').eq('code', code).single()
      if (dbError || !data) { setError('Room not found.'); return }
      const r = data as Room
      setRoom(r)
      roomRef.current = r
      setIsCreator(r.creator_id === getFanId())
      await joinRoom(r.id)
      fetchFanCount(r.id)
      handleRoomUpdate(r)
    }
    load()

    const roomChannel = supabase.channel(`room_${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
        payload => {
          const updated = payload.new as Room
          setRoom(updated)
          roomRef.current = updated
          handleRoomUpdate(updated)
        }
      ).subscribe()

    const fansChannel = supabase.channel(`fans_${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_fans' },
        () => { if (roomRef.current) fetchFanCount(roomRef.current.id) }
      ).subscribe()

    return () => {
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(fansChannel)
    }
  }, [code])

  async function fetchFanCount(roomId: string) {
    const { count } = await supabase
      .from('room_fans').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    setFanCount(count ?? 0)
  }

  async function launchCountdown() {
    if (!room) return
    setIsLaunching(true)
    const launchAt = new Date(Date.now() + countdownSecs * 1000).toISOString()
    await supabase.from('rooms').update({ status: 'countdown', launch_at: launchAt }).eq('id', room.id)
    setIsLaunching(false)
  }

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/room/${code}`
    : `/room/${code}`

  if (error) {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-[#FF4D00] text-xl font-bold mb-4">{error}</p>
          <a href="/" className="text-gray-400 underline">Back to Discover</a>
        </div>
      </main>
    )
  }

  // COUNTDOWN view
  if (countdown !== null && countdown > 0) {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4">
        <p className="text-gray-400 uppercase tracking-widest text-sm mb-4">Chant launches in</p>
        <div key={countdown} className="countdown-tick text-[120px] font-black text-[#FF4D00] leading-none tabular-nums">
          {countdown}
        </div>
        <p className="mt-4 text-green-500 text-sm uppercase tracking-widest">&#x1F50A; Sound ready</p>
        {room?.chant_text && (
          <div className="mt-10 bg-[#1a1a1a] rounded-xl px-6 py-4 max-w-sm border border-[#333]">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Chant</p>
            <p className="text-white font-bold text-xl uppercase">{room.chant_text}</p>
          </div>
        )}
      </main>
    )
  }

  // ROOM view
  return (
    <main className="min-h-screen bg-[#0D0D0D] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors">
            Leave
          </button>
          <div>
            <h1 className="text-white font-black text-xl">{room?.venue_name || code}</h1>
            {room?.section && <p className="text-gray-500 text-sm">{room.section}</p>}
          </div>
        </div>

        <div className="bg-[#FF4D00]/10 border border-[#FF4D00]/30 rounded-2xl p-5 text-center mb-5">
          <p className="text-5xl font-black text-[#FF4D00]">{fanCount}</p>
          <p className="text-sm text-gray-400 uppercase tracking-widest mt-1">
            {fanCount === 1 ? 'Fan in room' : 'Fans in room'}
          </p>
        </div>

        {room?.chant_text && (
          <div className="bg-[#1a1a1a] rounded-2xl p-6 text-center border border-[#333] mb-5">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Chant</p>
            <p className="text-[#FF4D00] font-black text-3xl uppercase">{room.chant_text}</p>
          </div>
        )}

        <div className="bg-[#1a1a1a] rounded-xl p-4 text-center border border-[#333] mb-3">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Room Code</p>
          <p className="text-white font-black text-3xl tracking-[0.2em]">{code}</p>
        </div>

        <button
          onClick={() => setShowQr(v => !v)}
          className="w-full text-center text-gray-500 text-sm uppercase tracking-widest mb-4 hover:text-gray-300 py-2"
        >
          {showQr ? 'Hide QR' : 'Show QR Code'}
        </button>
        {showQr && <div className="flex justify-center mb-5"><QRCodeDisplay url={joinUrl} /></div>}

        {isCreator && room?.status === 'waiting' && (
          <div className="mt-4">
            <p className="text-gray-400 text-sm uppercase tracking-widest mb-3 text-center">Launch countdown</p>
            <div className="flex gap-2 justify-center mb-4">
              {[10, 30, 60].map(s => (
                <button
                  key={s}
                  onClick={() => setCountdownSecs(s)}
                  className={`px-5 py-2 rounded-xl font-bold uppercase transition-all ${
                    countdownSecs === s
                      ? 'bg-[#FF4D00] text-white'
                      : 'bg-[#1a1a1a] border border-[#333] text-gray-300 hover:border-[#FF4D00]'
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
            <button
              onClick={launchCountdown}
              disabled={isLaunching}
              className="w-full py-5 bg-[#FF4D00] text-white text-2xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] disabled:opacity-40 active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
            >
              {isLaunching ? 'Launching...' : `LAUNCH (${countdownSecs}s)`}
            </button>
          </div>
        )}

        {!isCreator && (
          <div className="mt-6 text-center">
            <div className="w-8 h-8 border-4 border-[#FF4D00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 uppercase tracking-widest text-sm">Waiting for leader to launch...</p>
          </div>
        )}
      </div>
    </main>
  )
}
