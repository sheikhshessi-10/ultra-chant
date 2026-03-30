'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase, getServerTimeOffset, Session } from '@/lib/supabase'

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
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // Single persistent audio element — always in DOM so ref is always valid
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const launchedRef = useRef(false)
  const prevCountdownRef = useRef<number | null>(null)

  // Get server time offset on mount
  useEffect(() => {
    getServerTimeOffset().then(offset => setTimeOffset(offset))
  }, [])

  // Unlock audio + TTS on iOS/Chrome — requires a user gesture
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return
    // Unlock TTS by speaking a silent utterance
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
    // Unlock HTML audio element
    const audio = audioRef.current
    if (audio) {
      audio.volume = 0
      audio.play().then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.volume = 1
      }).catch(() => {})
    }
    setAudioUnlocked(true)
  }, [audioUnlocked])

  const updateCountdown = useCallback((launchAt: string) => {
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      const now = Date.now() + timeOffset
      const launch = new Date(launchAt).getTime()
      const remaining = Math.max(0, Math.ceil((launch - now) / 1000))
      setCountdown(remaining)

      if (prevCountdownRef.current !== remaining) {
        setTickKey(k => k + 1)
        prevCountdownRef.current = remaining
      }

      if (remaining <= 0 && !launchedRef.current) {
        launchedRef.current = true
        clearInterval(timerRef.current!)
        triggerLaunch()
      }
    }, 100)
  }, [timeOffset])

  function speakChant(text: string) {
    if (!text || typeof window === 'undefined') return
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel() // clear any queued speech
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85   // slightly slower — sounds like a chant
    utterance.pitch = 1.1
    utterance.volume = 1
    // Pick a loud voice if available
    const voices = synth.getVoices()
    const preferred = voices.find(v => v.lang.startsWith('en') && v.localService)
    if (preferred) utterance.voice = preferred
    synth.speak(utterance)
  }

  function triggerLaunch() {
    setPhase('live')
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 2000)

    // TTS — speak the chant text on every device
    if (session?.chant_text) {
      speakChant(session.chant_text)
    }

    // Also play recorded audio if leader used mic
    const audio = audioRef.current
    if (audio && audio.src) {
      audio.currentTime = 0
      audio.volume = 1
      audio.play().catch((err) => {
        console.warn('Audio play blocked:', err)
      })
    }
  }

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
          handleSessionUpdate(updated)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [code, timeOffset])

  // Update audio src whenever session changes
  useEffect(() => {
    if (session?.audio_url && audioRef.current) {
      audioRef.current.src = session.audio_url
      audioRef.current.load()
    }
  }, [session?.audio_url])

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
      setPhase('ended')
    }
  }

  // LOADING
  if (phase === 'loading') {
    return (
      <main className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        {/* Audio always present in DOM */}
        <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
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
        <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
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
        <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
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
      <main
        className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4"
        onClick={unlockAudio}
      >
        <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
        <div className="text-center">
          <p className="text-gray-400 uppercase tracking-widest text-sm mb-6">Chant launches in</p>
          <div
            key={tickKey}
            className="countdown-tick text-[120px] font-black text-[#FF4D00] leading-none tabular-nums"
          >
            {countdown}
          </div>

          {/* Audio unlock prompt — critical for iOS/Chrome */}
          {session?.audio_url && !audioUnlocked && (
            <button
              onClick={unlockAudio}
              className="mt-4 px-6 py-2 bg-[#FF4D00]/20 border border-[#FF4D00] rounded-full text-[#FF4D00] text-sm uppercase tracking-widest font-bold animate-pulse"
            >
              🔊 Tap to enable sound
            </button>
          )}
          {session?.audio_url && audioUnlocked && (
            <p className="mt-4 text-green-500 text-sm uppercase tracking-widest">🔊 Sound ready</p>
          )}

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
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
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
