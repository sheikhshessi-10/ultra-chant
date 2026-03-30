'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, generateCode } from '@/lib/supabase'
import { unlockAudio } from '@/lib/audio'
import QRCodeDisplay from '@/components/QRCodeDisplay'

type Step = 'build' | 'session' | 'countdown'

export default function CreatePage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('build')
  const [chantText, setChantText] = useState('')
  const [sessionCode, setSessionCode] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [leaderId] = useState(() => `leader_${Math.random().toString(36).slice(2, 10)}`)
  const [participantCount, setParticipantCount] = useState(0)
  const [countdownSecs, setCountdownSecs] = useState(30)
  const [customSecs, setCustomSecs] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Subscribe to participant count once session is created
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`participants_${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
        () => fetchParticipantCount()
      )
      .subscribe()

    fetchParticipantCount()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  async function fetchParticipantCount() {
    if (!sessionId) return
    const { count } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
    setParticipantCount(count ?? 0)
  }

  // Live-sync chant text to DB as leader types
  const syncChantText = useCallback(async (text: string) => {
    if (!sessionId) return
    await supabase.from('sessions').update({ chant_text: text }).eq('id', sessionId)
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || step !== 'session') return
    const timer = setTimeout(() => syncChantText(chantText), 300)
    return () => clearTimeout(timer)
  }, [chantText, sessionId, step, syncChantText])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Pick a MIME type supported by this browser (iOS needs mp4, Chrome prefers webm)
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) || ''
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/mp4'
        const blob = new Blob(chunksRef.current, { type })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access in your browser settings.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  async function generateSession() {
    // Unlock audio from this user gesture (leader's tap on GENERATE SESSION)
    unlockAudio()

    if (!chantText.trim() && !audioBlob) {
      alert('Add a chant text or record audio first.')
      return
    }
    setIsGenerating(true)

    const code = generateCode()
    let uploadedAudioUrl: string | null = null

    if (audioBlob) {
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
      const fileName = `${code}-${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio')
        .upload(fileName, audioBlob, { contentType: audioBlob.type })
      if (uploadError) {
        console.error('Audio upload failed:', uploadError)
        alert(`Audio upload failed: ${uploadError.message}. Session will be created without audio.`)
      } else if (uploadData) {
        const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName)
        uploadedAudioUrl = urlData.publicUrl
      }
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        code,
        leader_id: leaderId,
        chant_text: chantText,
        audio_url: uploadedAudioUrl,
        status: 'building',
      })
      .select()
      .single()

    if (error || !data) {
      alert('Failed to create session. Try again.')
      setIsGenerating(false)
      return
    }

    setSessionCode(code)
    setSessionId(data.id)
    setAudioUrl(uploadedAudioUrl)
    setStep('session')
    setIsGenerating(false)
  }

  async function launchChant() {
    setIsLaunching(true)
    const secs = countdownSecs === -1 ? parseInt(customSecs) || 30 : countdownSecs
    const launchAt = new Date(Date.now() + secs * 1000).toISOString()

    await supabase
      .from('sessions')
      .update({ status: 'countdown', launch_at: launchAt })
      .eq('id', sessionId)

    setIsLaunching(false)
    // Redirect leader immediately — they'll tap the overlay, then watch countdown on session page
    router.push(`/session/${sessionCode}?leader=1`)
  }

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join?code=${sessionCode}`
    : `/join?code=${sessionCode}`

  // STEP 1: Build the chant
  if (step === 'build') {
    return (
      <main className="min-h-screen bg-[#0D0D0D] px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors">
              ← Back
            </button>
            <h1 className="text-2xl font-black uppercase text-[#FF4D00]">Build Your Chant</h1>
          </div>

          {/* Chant text input */}
          <div className="mb-6">
            <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
              Chant Text
            </label>
            <textarea
              value={chantText}
              onChange={e => setChantText(e.target.value)}
              placeholder="Type your chant here..."
              rows={4}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-[#FF4D00] resize-none"
            />
          </div>

          {/* Live Preview */}
          {chantText && (
            <div className="mb-6 bg-[#1a1a1a] rounded-xl p-6 text-center border border-[#333]">
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Preview</p>
              <p className="text-3xl font-black uppercase text-[#FF4D00] leading-tight">{chantText}</p>
            </div>
          )}

          {/* Audio recording */}
          <div className="mb-6">
            <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
              Audio (optional)
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold uppercase tracking-wide transition-all ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : 'bg-[#1a1a1a] border border-[#333] text-white hover:border-[#FF4D00]'
                }`}
              >
                {isRecording ? '⏹ Stop Recording' : '🎤 Record Audio'}
              </button>
              {audioUrl && !isRecording && (
                <audio controls src={audioUrl} className="flex-1 h-10" />
              )}
            </div>
          </div>

          {/* Generate Session Button */}
          <button
            onClick={generateSession}
            disabled={isGenerating || (!chantText.trim() && !audioBlob)}
            className="w-full py-4 bg-[#FF4D00] text-white text-xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
          >
            {isGenerating ? 'Creating...' : 'GENERATE SESSION'}
          </button>
        </div>
      </main>
    )
  }

  // STEP 2: Session created — show QR + participant count
  if (step === 'session') {
    return (
      <main className="min-h-screen bg-[#0D0D0D] px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black uppercase text-[#FF4D00] mb-1">Session Ready</h1>
            <p className="text-gray-400 text-sm">Share the code or QR to get people in</p>
          </div>

          {/* Join Code */}
          <div className="bg-[#1a1a1a] rounded-2xl p-6 text-center mb-6 border border-[#333]">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Join Code</p>
            <p className="text-5xl font-black text-white tracking-[0.2em]">{sessionCode}</p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center mb-6">
            <QRCodeDisplay url={joinUrl} />
          </div>

          {/* Participant count */}
          <div className="bg-[#FF4D00]/10 border border-[#FF4D00]/30 rounded-xl p-4 text-center mb-6">
            <p className="text-4xl font-black text-[#FF4D00]">{participantCount}</p>
            <p className="text-sm text-gray-400 uppercase tracking-widest">People Joined</p>
          </div>

          {/* Edit chant while waiting */}
          <div className="mb-6">
            <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
              Update Chant Text
            </label>
            <textarea
              value={chantText}
              onChange={e => setChantText(e.target.value)}
              rows={3}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-[#FF4D00] resize-none"
            />
          </div>

          {/* Countdown picker */}
          <div className="mb-6">
            <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
              Countdown Timer
            </label>
            <div className="flex gap-2 flex-wrap">
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
              <button
                onClick={() => setCountdownSecs(-1)}
                className={`px-5 py-2 rounded-xl font-bold uppercase transition-all ${
                  countdownSecs === -1
                    ? 'bg-[#FF4D00] text-white'
                    : 'bg-[#1a1a1a] border border-[#333] text-gray-300 hover:border-[#FF4D00]'
                }`}
              >
                Custom
              </button>
            </div>
            {countdownSecs === -1 && (
              <input
                type="number"
                placeholder="Seconds"
                value={customSecs}
                onChange={e => setCustomSecs(e.target.value)}
                className="mt-2 w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#FF4D00]"
              />
            )}
          </div>

          {/* Launch Button */}
          <button
            onClick={launchChant}
            disabled={isLaunching}
            className="w-full py-5 bg-[#FF4D00] text-white text-2xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] disabled:opacity-40 active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
          >
            {isLaunching ? 'Launching...' : `LAUNCH (${countdownSecs === -1 ? customSecs || '?' : countdownSecs}s)`}
          </button>
        </div>
      </main>
    )
  }

  // STEP 3: Countdown in progress
  return (
    <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[#FF4D00] font-black uppercase tracking-widest text-lg mb-4">Chant launching...</p>
        <p className="text-gray-400 text-xl mb-8">Code: <span className="text-white font-bold">{sessionCode}</span></p>
        <p className="text-gray-500">Redirecting you to the live session...</p>
      </div>
    </main>
  )
}
