'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, roomsNear, Room } from '@/lib/supabase'
import PermissionGate from '@/components/PermissionGate'

type Tab = 'nearby' | 'join'

export default function DiscoverPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('nearby')
  const [rooms, setRooms] = useState<Room[]>([])
  const [locationError, setLocationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joiningLoading, setJoiningLoading] = useState(false)
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null)
  const scannerDivRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<unknown>(null)

  useEffect(() => { fetchNearby() }, [])

  useEffect(() => {
    if (tab !== 'join') return
    let instance: unknown = null
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (!scannerDivRef.current) return
      const scanner = new Html5QrcodeScanner('qr-discover', { fps: 10, qrbox: 200 }, false)
      scanner.render(
        (text: string) => {
          let code = text.trim().toUpperCase()
          try {
            const url = new URL(text)
            const fromParam = url.searchParams.get('code')
            const fromPath = url.pathname.split('/').filter(Boolean).pop()
            if (fromParam) code = fromParam.toUpperCase()
            else if (fromPath && fromPath.length >= 5) code = fromPath.toUpperCase()
          } catch { /* not a URL */ }
          scanner.clear()
          handleJoinCode(code)
        },
        () => {}
      )
      instance = scanner
      scannerRef.current = scanner
    })
    return () => {
      if (instance) (instance as { clear: () => Promise<void> }).clear().catch(() => {})
    }
  }, [tab])

  async function fetchNearby() {
    setLoading(true)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      )
      const nearby = await roomsNear(pos.coords.latitude, pos.coords.longitude)
      setRooms(nearby)
    } catch {
      setLocationError('Enable location access to see chants near you.')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinCode(code: string) {
    if (!code) return
    setJoiningLoading(true)
    setJoinError('')
    const { data, error } = await supabase
      .from('rooms').select('code, status').eq('code', code).single()
    if (error || !data) {
      setJoinError('Room not found. Check the code and try again.')
      setJoiningLoading(false)
      return
    }
    if (data.status === 'ended') {
      setJoinError('This room has ended.')
      setJoiningLoading(false)
      return
    }
    setJoiningLoading(false)
    setPendingRoomCode(code)
  }

  return (
    <>
      {pendingRoomCode && (
        <PermissionGate
          onComplete={() => router.push(`/room/${pendingRoomCode}`)}
          onCancel={() => setPendingRoomCode(null)}
        />
      )}

      <main className="min-h-screen bg-[#0D0D0D]">
        <div className="px-4 pt-8 pb-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF4D00] rounded-full flex items-center justify-center shadow-lg shadow-[#FF4D00]/40">
                <span className="text-xl font-black text-white">U</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase">
                ULTRA<span className="text-[#FF4D00]">CHANT</span>
              </h1>
            </div>
            <button
              onClick={() => router.push('/create')}
              className="flex items-center gap-1 px-4 py-2 bg-[#FF4D00] text-white font-black uppercase text-sm tracking-widest rounded-xl hover:bg-[#e04400] active:scale-95 transition-all"
            >
              + Create
            </button>
          </div>

          <div className="flex bg-[#1a1a1a] rounded-xl p-1 mb-4">
            {(['nearby', 'join'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg font-bold uppercase text-sm tracking-widest transition-all ${
                  tab === t ? 'bg-[#FF4D00] text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'nearby' ? 'Near You' : 'Join by Code'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'nearby' && (
          <div className="px-4 pb-8">
            {loading && (
              <div className="flex flex-col items-center py-16 gap-4">
                <div className="w-12 h-12 border-4 border-[#FF4D00] border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 uppercase tracking-widest text-sm">Finding chants near you...</p>
              </div>
            )}
            {!loading && locationError && (
              <div className="mt-4 bg-[#1a1a1a] rounded-xl p-5 text-center border border-[#333]">
                <p className="text-gray-400 text-sm mb-4">{locationError}</p>
                <button onClick={fetchNearby} className="text-[#FF4D00] text-sm font-bold uppercase tracking-widest">
                  Try Again
                </button>
              </div>
            )}
            {!loading && !locationError && rooms.length === 0 && (
              <div className="mt-8 text-center py-12">
                <div className="text-5xl mb-4">&#x1F3DF;&#xFE0F;</div>
                <p className="text-white font-bold text-lg mb-2">No active chants near you</p>
                <p className="text-gray-500 text-sm mb-8">Be the first to start one</p>
                <button
                  onClick={() => router.push('/create')}
                  className="px-8 py-4 bg-[#FF4D00] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
                >
                  + Start a Chant
                </button>
              </div>
            )}
            {!loading && rooms.length > 0 && (
              <div className="flex flex-col gap-3">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setPendingRoomCode(room.code)}
                    className="w-full text-left bg-[#1a1a1a] rounded-2xl p-5 border border-[#333] hover:border-[#FF4D00] active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-white font-bold text-lg leading-tight">{room.venue_name}</p>
                        {room.section && <p className="text-gray-500 text-sm">{room.section}</p>}
                      </div>
                      <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ml-2 flex-shrink-0 ${
                        room.status === 'waiting' ? 'bg-green-500/20 text-green-400' :
                        room.status === 'countdown' ? 'bg-[#FF4D00]/20 text-[#FF4D00]' :
                        'bg-gray-700 text-gray-400'
                      }`}>{room.status}</span>
                    </div>
                    <p className="text-[#FF4D00] font-black text-xl uppercase">{room.chant_text}</p>
                    <p className="text-gray-600 text-xs mt-2 uppercase tracking-widest">Code: {room.code}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'join' && (
          <div className="px-4 pb-8">
            <div className="mt-2 mb-6">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">Scan QR Code</p>
              <div
                ref={scannerDivRef}
                id="qr-discover"
                className="rounded-2xl overflow-hidden bg-[#1a1a1a] border border-[#333]"
                style={{ minHeight: '220px' }}
              />
            </div>
            <div className="flex items-center gap-4 mb-5">
              <div className="flex-1 h-px bg-[#333]" />
              <span className="text-gray-500 text-sm uppercase tracking-widest">or enter code</span>
              <div className="flex-1 h-px bg-[#333]" />
            </div>
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoinCode(joinCode.trim())}
              placeholder="e.g. ULTRA42"
              maxLength={10}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-4 text-white text-2xl font-black text-center tracking-[0.2em] placeholder-gray-600 focus:outline-none focus:border-[#FF4D00] uppercase mb-4"
            />
            {joinError && <p className="text-red-400 text-sm text-center mb-4">{joinError}</p>}
            <button
              onClick={() => handleJoinCode(joinCode.trim())}
              disabled={joiningLoading || !joinCode.trim()}
              className="w-full py-4 bg-[#FF4D00] text-white text-xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
            >
              {joiningLoading ? 'Checking...' : 'Join Room'}
            </button>
          </div>
        )}
      </main>
    </>
  )
}
