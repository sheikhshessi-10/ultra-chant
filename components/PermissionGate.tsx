'use client'

import { useState, useRef, useEffect } from 'react'
import { unlockAudio, playTick } from '@/lib/audio'

type Step = 'location' | 'mic' | 'camera' | 'speaker' | 'ready'
type StepStatus = 'pending' | 'running' | 'pass' | 'fail'

interface Props {
  onComplete: () => void
  onCancel: () => void
}

export default function PermissionGate({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>('location')
  const [status, setStatus] = useState<StepStatus>('running')
  const [error, setError] = useState('')
  const [speakerTested, setSpeakerTested] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => { checkLocation() }, [])

  useEffect(() => {
    if (step !== 'camera') {
      cameraStreamRef.current?.getTracks().forEach(t => t.stop())
      cameraStreamRef.current = null
    }
  }, [step])

  async function checkLocation() {
    setStatus('running')
    setError('')
    try {
      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000, enableHighAccuracy: false })
      )
      setStatus('pass')
      setTimeout(() => { setStep('mic'); setStatus('pending') }, 700)
    } catch {
      setStatus('fail')
      setError('Location denied. Enable it in browser settings and refresh.')
    }
  }

  async function checkMic() {
    setStatus('running')
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      await new Promise<void>((resolve, reject) => {
        const mr = new MediaRecorder(stream)
        const chunks: Blob[] = []
        mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
        mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); chunks.length > 0 ? resolve() : reject() }
        mr.start()
        setTimeout(() => mr.stop(), 1000)
      })
      setStatus('pass')
      setTimeout(() => { setStep('camera'); setStatus('pending') }, 700)
    } catch {
      setStatus('fail')
      setError('Microphone denied. Enable it in browser settings and refresh.')
    }
  }

  async function checkCamera() {
    setStatus('running')
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      cameraStreamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setStatus('pass')
      setTimeout(() => {
        cameraStreamRef.current?.getTracks().forEach(t => t.stop())
        cameraStreamRef.current = null
        setStep('speaker')
        setStatus('pending')
      }, 1500)
    } catch {
      setStatus('fail')
      setError('Camera denied. Enable it in browser settings and refresh.')
    }
  }

  function testSpeaker() {
    // THIS TAP IS THE iOS AUDIO UNLOCK GESTURE
    unlockAudio()
    playTick(880, 100)
    setTimeout(() => playTick(1100, 100), 220)
    setTimeout(() => playTick(1320, 150), 440)
    setSpeakerTested(true)
  }

  function confirmSpeaker() {
    setStatus('pass')
    setTimeout(() => { setStep('ready') }, 600)
  }

  const stepIdx = ['location', 'mic', 'camera', 'speaker', 'ready'].indexOf(step)

  return (
    <div className="fixed inset-0 z-50 bg-[#0D0D0D] flex flex-col">
      <div className="flex items-center justify-between px-5 pt-8 pb-4">
        <button onClick={onCancel} className="text-gray-500 hover:text-white text-sm uppercase tracking-widest transition-colors">
          Cancel
        </button>
        <div className="flex gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${
              i < stepIdx ? 'bg-green-500' : i === stepIdx ? 'bg-[#FF4D00]' : 'bg-[#333]'
            }`} />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">

        {step === 'location' && (
          <>
            <div className="text-6xl mb-6">&#x1F4CD;</div>
            <h2 className="text-2xl font-black uppercase text-white mb-3">Location</h2>
            <p className="text-gray-400 mb-8">Ultra needs your location to find chants near you</p>
            {status === 'running' && <Spinner />}
            {status === 'pass' && <PassBadge />}
            {status === 'fail' && <ErrorBlock error={error} onRetry={checkLocation} />}
          </>
        )}

        {step === 'mic' && (
          <>
            <div className="text-6xl mb-6">&#x1F3A4;</div>
            <h2 className="text-2xl font-black uppercase text-white mb-3">Microphone</h2>
            <p className="text-gray-400 mb-8">Ultra needs your mic to capture the crowd atmosphere</p>
            {status === 'pending' && <ActionBtn onClick={checkMic} label="Allow Microphone" />}
            {status === 'running' && <Spinner text="Testing mic..." />}
            {status === 'pass' && <PassBadge />}
            {status === 'fail' && <ErrorBlock error={error} onRetry={() => { setStatus('pending'); setError('') }} />}
          </>
        )}

        {step === 'camera' && (
          <>
            <div className="text-5xl mb-4">&#x1F4F8;</div>
            <h2 className="text-2xl font-black uppercase text-white mb-3">Camera</h2>
            <p className="text-gray-400 mb-5">Ultra needs your camera to capture your moment</p>
            {status === 'pending' && <ActionBtn onClick={checkCamera} label="Allow Camera" />}
            {(status === 'running' || status === 'pass') && (
              <div className={`relative w-48 h-36 rounded-xl overflow-hidden bg-[#1a1a1a] border-2 mb-4 ${status === 'pass' ? 'border-green-500' : 'border-[#333]'}`}>
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                {status === 'pass' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                    <span className="text-4xl text-green-400">&#x2713;</span>
                  </div>
                )}
              </div>
            )}
            {status === 'fail' && <ErrorBlock error={error} onRetry={() => { setStatus('pending'); setError('') }} />}
          </>
        )}

        {step === 'speaker' && (
          <>
            <div className="text-6xl mb-6">&#x1F50A;</div>
            <h2 className="text-2xl font-black uppercase text-white mb-3">Speaker Test</h2>
            {!speakerTested ? (
              <>
                <p className="text-gray-400 mb-3">Turn your volume up, then tap to test</p>
                <p className="text-xs text-gray-600 uppercase tracking-widest mb-8">This unlocks sound for the chant</p>
                <ActionBtn onClick={testSpeaker} label="Tap to Test Speaker" />
              </>
            ) : (
              <>
                <p className="text-gray-400 mb-8">Did you hear 3 beeps?</p>
                <div className="flex gap-3">
                  <button onClick={confirmSpeaker} className="flex-1 py-4 bg-[#FF4D00] text-white font-black uppercase rounded-xl hover:bg-[#e04400] active:scale-95 transition-all">
                    Yes, heard it
                  </button>
                  <button onClick={() => setSpeakerTested(false)} className="flex-1 py-4 bg-[#1a1a1a] border border-[#333] text-gray-300 font-bold uppercase rounded-xl hover:border-[#FF4D00]">
                    No, retry
                  </button>
                </div>
              </>
            )}
            {status === 'pass' && <PassBadge />}
          </>
        )}

        {step === 'ready' && (
          <>
            <div className="text-6xl mb-6">&#x1F525;</div>
            <h2 className="text-3xl font-black uppercase text-white mb-3">All Set</h2>
            <p className="text-gray-400 mb-10">Your device is ready. Sound is unlocked.</p>
            <button
              onClick={onComplete}
              className="w-full max-w-xs py-5 bg-[#FF4D00] text-white text-2xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
            >
              Enter Room
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Spinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-12 h-12 border-4 border-[#FF4D00] border-t-transparent rounded-full animate-spin" />
      {text && <p className="text-gray-500 text-sm uppercase tracking-widest">{text}</p>}
    </div>
  )
}

function PassBadge() {
  return (
    <div className="flex items-center gap-2 text-green-500 font-bold uppercase tracking-widest">
      <span className="text-3xl">&#x2713;</span>
      <span>Passed</span>
    </div>
  )
}

function ActionBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="px-8 py-4 bg-[#FF4D00] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30">
      {label}
    </button>
  )
}

function ErrorBlock({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-red-400 text-sm">{error}</p>
      <button onClick={onRetry} className="px-6 py-3 border border-[#FF4D00] text-[#FF4D00] font-bold uppercase tracking-widest rounded-xl hover:bg-[#FF4D00]/10">
        Retry
      </button>
    </div>
  )
}
