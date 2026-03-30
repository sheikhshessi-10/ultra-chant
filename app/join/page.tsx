'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { unlockAudio } from '@/lib/audio'

function JoinContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code') || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scannerReady, setScannerReady] = useState(false)
  const scannerRef = useRef<unknown>(null)
  const scannerDivRef = useRef<HTMLDivElement>(null)

  // Auto-submit if code was passed in URL
  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (urlCode) {
      handleJoin(urlCode)
    }
  }, [])

  useEffect(() => {
    // Dynamically import html5-qrcode (client-side only)
    let scannerInstance: unknown = null
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (!scannerDivRef.current) return
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: 250 },
        false
      )
      scanner.render(
        (decodedText: string) => {
          // Extract code from URL or use raw text
          let extractedCode = decodedText
          try {
            const url = new URL(decodedText)
            const urlCode = url.searchParams.get('code')
            if (urlCode) extractedCode = urlCode
          } catch {
            // Not a URL, use as-is
          }
          scanner.clear()
          setCode(extractedCode.toUpperCase())
          handleJoin(extractedCode.toUpperCase())
        },
        (errorMsg: string) => {
          // Scanning errors are normal, ignore
        }
      )
      scannerInstance = scanner
      scannerRef.current = scanner
      setScannerReady(true)
    })

    return () => {
      if (scannerInstance) {
        (scannerInstance as { clear: () => Promise<void> }).clear().catch(() => {})
      }
    }
  }, [])

  async function handleJoin(joinCode?: string) {
    const useCode = (joinCode || code).toUpperCase().trim()
    if (!useCode) {
      setError('Enter a session code.')
      return
    }
    setLoading(true)
    setError('')

    const { data, error: dbError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('code', useCode)
      .single()

    if (dbError || !data) {
      setError('Session not found. Check the code and try again.')
      setLoading(false)
      return
    }

    if (data.status === 'ended') {
      setError('This session has ended.')
      setLoading(false)
      return
    }

    // Unlock audio from this user gesture before navigating
    unlockAudio()

    // Register as participant
    await supabase.from('participants').insert({ session_id: data.id })

    router.push(`/session/${useCode}`)
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors">
            ← Back
          </button>
          <h1 className="text-2xl font-black uppercase text-[#FF4D00]">Join Chant</h1>
        </div>

        {/* QR Scanner */}
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">Scan QR Code</p>
          <div
            ref={scannerDivRef}
            id="qr-reader"
            className="rounded-2xl overflow-hidden bg-[#1a1a1a] border border-[#333]"
            style={{ minHeight: '250px' }}
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-[#333]" />
          <span className="text-gray-500 text-sm uppercase tracking-widest">or enter code</span>
          <div className="flex-1 h-px bg-[#333]" />
        </div>

        {/* Manual Code Entry */}
        <div className="mb-4">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="e.g. ULTRA42"
            maxLength={10}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-4 text-white text-2xl font-black text-center tracking-[0.2em] placeholder-gray-600 focus:outline-none focus:border-[#FF4D00] uppercase"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        )}

        <button
          onClick={() => handleJoin()}
          disabled={loading || !code.trim()}
          className="w-full py-4 bg-[#FF4D00] text-white text-xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
        >
          {loading ? 'Joining...' : 'JOIN SESSION'}
        </button>
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <p className="text-gray-400 uppercase tracking-widest">Loading...</p>
      </main>
    }>
      <JoinContent />
    </Suspense>
  )
}
