'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase, getServerTimeOffset, Session } from '@/lib/supabase'
import { speakChant, playAudioUrl, requestWakeLock, releaseWakeLock } from '@/lib/audio'

type Phase = 'loading' | 'building' | 'countdown' | 'live' | 'ended'

export default function SessionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const code = (params.code as string).toUpperCase()
  const isLeader = searchParams.get('leader') === '1'

  const [session, setSession] = useState<Session | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [timeOffset, setTimeOffset] = useState(0)
  const [isFlashing, setIsFlashing] = useState(false)
  const [tickKey, setTickKey] = useState(0)
  const [error, setError] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const launchedRef = useRef(false)
  const prevCountdownRef = useRef<number | null>(null)
  const preFiredRef = useRef(false)
  // Hold latest session in a ref so triggerLaunch can access it without stale closure
  const sessionRef = useRef<Session | null>(null)

  // Get server time offset on mount
  useEffect(() => {
    getServerTimeOffset().then(offset => setTimeOffset(offset))
  }, [])

  // Keep sessionRef in sync
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Release wake lock on unmount
  useEffect(() => {
    return () => {
      releaseWakeLock()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function triggerLaunch() {
    setPhase('live')
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 2000)

    // Set page title to chant text so it shows on lock screen
    const chantText = sessionRef.current?.chant_text
    if (chantText && typeof document !== 'undefined') {
      document.title = chantText
    }

    // TTS — speak the chant 3x for stadium effect
    if (chantText) {
      speakChant(chantText)
    }

    // Play recorded audio if available
    const audioUrl = sessionRef.current?.audio_url
    if (audioUrl) {
      playAudioUrl(audioUrl)
    }

    releaseWakeLock()
  }

  const updateCountdown = useCallback((launchAt: string) => {
    if (timerRef.current) clearInterval(timerRef.current)

    // Pre-warm TTS voices when countdown starts
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices()
    }

    // Request wake lock to keep screen on during countdown
    requestWakeLock()

    timerRef.current = setInterval(() => {
      const now = Date.now() + timeOffset
      const launch = new Date(launchAt).getTime()
      const remaining = Math.max(0, Math.ceil((launch - now) / 1000))
      setCountdown(remaining)

      if (prevCountdownRef.current !== remaining) {
        setTickKey(k => k + 1)
        prevCountdownRef.current = remaining
      }

      // Pre-fire: when we're at 1 second, schedule exact-ms trigger for T=0
      if (remaining <= 1 && !preFiredRef.current) {
        preFiredRef.current = true
        const exactMs = Math.max(0, launch - (Date.now() + timeOffset))
        setTimeout(() => {
          if (!launchedRef.current) {
            launchedRef.current = true
            clearInterval(timerRef.current!)
            triggerLaunch()
          }
        }, exactMs)
      }
    }, 100)
  }, [timeOffset])

  // Load session and subscribe to changes
  useEffect(() => {
    loadSession()

    const channel = supabase
      .channel(`session_${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `code=eq.${code}` },
        (payload) => {
          const updated = payload.new as Session
          setSession(updated)
          sessionRef.current = updated
          handleSessionUpdate(updated)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [code, timeOffset])

  async function loadSession() {
    const { data, error: dbError } = await supabase
      .from('sessions')
      .select('*')
      .eq('code', code)
      .single()

    if (dbError || !data) {
      setError('Session not found.')
      setPhase('ended')
      return
    }

    setSession(data as Session)
    sessionRef.current = data as Session
    handleSessionUpdate(data as Session)
  }

  function handleSessionUpdate(s: Session) {
    if (s.status === 'building') {
      setPhase('building')
    } else if (s.status === 'countdown' && s.launch_at) {
      setPhase('countdown')
      const now = Date.now() + timeOffset
      const launch = new Date(s.launch_at).getTime()
      if (now >= launch) {
        if (!launchedRef.current) {
          launchedRef.current = true
          triggerLaunch()
        }
      } else {
        updateCountdown(s.launch_at)
      }
    } else if (s.status === 'live') {
      if (!launchedRef.current) {
        launchedRef.current = true
        triggerLaunch()
      }
    } else if (s.status === 'ended') {
      releaseWakeLock()
      setPhase('ended')
    }
  }

  // LOADING
  if (phase === 'loading') {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#FF4D00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 uppercase tracking-widest">Connecting...</p>
        </div>
      </main>
    )
  }

  // ERROR / ENDED
  if (phase === 'ended' || error) {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-[#FF4D00] text-xl font-bold mb-2">{error || 'Session Ended'}</p>
          <p className="text-gray-500 mb-6">This chant session is no longer active.</p>
          <a href="/" className="text-[#FF4D00] underline">Back to Home</a>
        </div>
      </main>
    )
  }

  // LIVE — fullscreen chant display
  if (phase === 'live') {
    return (
      <main
        className={`min-h-screen flex flex-col items-center justify-center px-6 transition-colors duration-300 ${
          isFlashing ? 'bg-[#FF4D00]' : 'bg-[#0D0D0D]'
        }`}
      >
        <div className="text-center slide-up">
          <p
            className={`text-6xl sm:text-8xl font-black uppercase leading-tight tracking-tight transition-colors duration-300 pulse-glow ${
              isFlashing ? 'text-white' : 'text-[#FF4D00]'
            }`}
          >
            {session?.chant_text || 'ULTRA!'}
          </p>
          <p className="mt-8 text-gray-500 uppercase tracking-widest text-sm">
            Session: {code}
          </p>
        </div>
      </main>
    )
  }

  // COUNTDOWN
  if (phase === 'countdown') {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 uppercase tracking-widest text-sm mb-6">Chant launches in</p>
          <div
            key={tickKey}
            className="countdown-tick text-[120px] font-black text-[#FF4D00] leading-none tabular-nums"
          >
            {countdown}
          </div>

          <p className="mt-4 text-green-500 text-sm uppercase tracking-widest">🔊 Sound ready</p>

          <p className="text-gray-500 uppercase tracking-widest text-sm mt-6">Get ready!</p>

          {session?.chant_text && (
            <div className="mt-10 bg-[#1a1a1a] rounded-xl px-6 py-4 max-w-sm border border-[#333]">
              <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Chant</p>
              <p className="text-white font-bold text-xl uppercase">{session.chant_text}</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  // BUILDING — waiting for leader to launch
  return (
    <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">
        <div className="w-16 h-16 border-4 border-[#FF4D00] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <p className="text-[#FF4D00] font-black uppercase tracking-widest text-lg mb-2">Waiting for Leader</p>
        <p className="text-gray-500 mb-6">The chant leader is setting up...</p>

        <div className="bg-[#1a1a1a] rounded-xl px-6 py-4 border border-[#333]">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Session</p>
          <p className="text-white font-black text-2xl tracking-widest">{code}</p>
        </div>

        {session?.chant_text && (
          <div className="mt-4 bg-[#1a1a1a] rounded-xl px-6 py-4 border border-[#FF4D00]/20">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Chant</p>
            <p className="text-[#FF4D00] font-bold text-xl uppercase">{session.chant_text}</p>
          </div>
        )}
      </div>
    </main>
  )
}
