'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getFanId, generateCode } from '@/lib/supabase'
import PermissionGate from '@/components/PermissionGate'

export default function CreatePage() {
  const router = useRouter()
  const [venueName, setVenueName] = useState('')
  const [section, setSection] = useState('')
  const [chantText, setChantText] = useState('Ole Ole Ole')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError('Location needed. Enable it in browser settings.')
    )
  }, [])

  async function createRoom() {
    if (!venueName.trim()) { alert('Enter a venue name.'); return }
    if (!location) { alert('Location required. Enable location access.'); return }
    setIsCreating(true)
    const code = generateCode()
    const fanId = getFanId()
    const { error } = await supabase.from('rooms').insert({
      code,
      venue_name: venueName.trim(),
      venue_lat: location.lat,
      venue_lng: location.lng,
      section: section.trim(),
      creator_id: fanId,
      chant_text: chantText.trim() || 'Ole Ole Ole',
      status: 'waiting',
    })
    if (error) {
      alert(`Failed to create room: ${error.message}`)
      setIsCreating(false)
      return
    }
    setCreatedCode(code)
    setIsCreating(false)
  }

  // After creation, show Permission Gate before entering room
  if (createdCode) {
    return (
      <PermissionGate
        onComplete={() => router.push(`/room/${createdCode}`)}
        onCancel={() => setCreatedCode(null)}
      />
    )
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors">
            Back
          </button>
          <h1 className="text-2xl font-black uppercase text-[#FF4D00]">Create Chant Room</h1>
        </div>

        {locationError && (
          <div className="mb-4 bg-red-900/20 border border-red-500/30 rounded-xl p-3">
            <p className="text-red-400 text-sm">{locationError}</p>
          </div>
        )}

        {!location && !locationError && (
          <div className="mb-4 flex items-center gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            Getting your location...
          </div>
        )}

        {location && (
          <div className="mb-4 flex items-center gap-2 text-green-500 text-sm">
            <span>&#x2713;</span>
            <span>Location ready</span>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
            Venue Name *
          </label>
          <input
            type="text"
            value={venueName}
            onChange={e => setVenueName(e.target.value)}
            placeholder="e.g. Old Trafford, Santiago Bernabeu"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-[#FF4D00]"
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
            Section (optional)
          </label>
          <input
            type="text"
            value={section}
            onChange={e => setSection(e.target.value)}
            placeholder="e.g. North Stand Block A"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#FF4D00]"
          />
        </div>

        <div className="mb-8">
          <label className="block text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
            Chant Text
          </label>
          <input
            type="text"
            value={chantText}
            onChange={e => setChantText(e.target.value)}
            placeholder="Ole Ole Ole"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white text-lg placeholder-gray-600 focus:outline-none focus:border-[#FF4D00]"
          />
          {chantText && (
            <div className="mt-3 bg-[#1a1a1a] rounded-xl p-4 text-center border border-[#333]">
              <p className="text-[#FF4D00] font-black text-2xl uppercase">{chantText}</p>
            </div>
          )}
        </div>

        <button
          onClick={createRoom}
          disabled={isCreating || !venueName.trim() || !location}
          className="w-full py-4 bg-[#FF4D00] text-white text-xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30"
        >
          {isCreating ? 'Creating...' : 'Create Room'}
        </button>
      </div>
    </main>
  )
}
