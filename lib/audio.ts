// Singleton AudioContext — persists across navigation in same tab
let _audioCtx: AudioContext | null = null

export function unlockAudio(): void {
  if (typeof window === 'undefined') return
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume()
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices()
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
    window.speechSynthesis.cancel()
  }
  sessionStorage.setItem('audioUnlocked', '1')
}

export function isAudioUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem('audioUnlocked') === '1'
}

// Short click/tick via AudioContext (for countdown)
export function playTick(freq = 880, durationMs = 80): void {
  if (!_audioCtx) return
  try {
    const now = _audioCtx.currentTime
    const osc = _audioCtx.createOscillator()
    const gain = _audioCtx.createGain()
    osc.connect(gain)
    gain.connect(_audioCtx.destination)
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.35, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000)
    osc.start(now)
    osc.stop(now + durationMs / 1000)
  } catch {
    // Ignore if AudioContext not ready
  }
}

// Speak a single countdown number via TTS
export function speakNumber(n: number): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(String(n))
  u.rate = 0.9
  u.pitch = 1.1
  u.volume = 1
  const voices = window.speechSynthesis.getVoices()
  const best = voices.find(v => v.lang.startsWith('en') && v.localService)
    ?? voices.find(v => v.lang.startsWith('en'))
  if (best) u.voice = best
  window.speechSynthesis.speak(u)
}

// Speak chant text 3x for stadium effect
export function speakChant(text: string, onDone?: () => void): void {
  if (!text || typeof window === 'undefined') return
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()

  function doSpeak() {
    let count = 0
    const sayOnce = () => {
      if (count >= 3) { onDone?.(); return }
      count++
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.8
      u.pitch = 1.1
      u.volume = 1
      const voices = synth.getVoices()
      const best = voices.find(v => v.lang.startsWith('en') && v.localService)
        ?? voices.find(v => v.lang.startsWith('en'))
      if (best) u.voice = best
      u.onend = sayOnce
      u.onerror = sayOnce
      synth.speak(u)
    }
    sayOnce()
  }

  const voices = synth.getVoices()
  if (voices.length > 0) {
    doSpeak()
  } else {
    synth.onvoiceschanged = () => { synth.onvoiceschanged = null; doSpeak() }
    setTimeout(doSpeak, 500)
  }
}

// Play ole chant — tries URL first, falls back to TTS
export function playOleChant(roomAudioUrl?: string | null, chantText?: string): void {
  const url = roomAudioUrl || process.env.NEXT_PUBLIC_OLE_CHANT_URL || null
  if (url) {
    const audio = new Audio(url)
    audio.volume = 1
    audio.play().catch(() => speakChant(chantText || 'Olé Olé Olé'))
  } else {
    speakChant(chantText || 'Olé Olé Olé')
  }
}

// Play a recorded audio URL
export function playAudioUrl(url: string): void {
  if (!url || typeof window === 'undefined') return
  const audio = new Audio(url)
  audio.volume = 1
  audio.play().catch(console.warn)
}

let _wakeLock: WakeLockSentinel | null = null

export async function requestWakeLock(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      _wakeLock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen')
    }
  } catch {
    // Not supported or denied — silently ignore
  }
}

export function releaseWakeLock(): void {
  _wakeLock?.release()
  _wakeLock = null
}
