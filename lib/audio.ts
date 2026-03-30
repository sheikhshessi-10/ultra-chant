// Singleton AudioContext — persists across navigation in same tab
let _audioCtx: AudioContext | null = null

export function unlockAudio(): void {
  // Create and resume AudioContext from user gesture
  if (typeof window === 'undefined') return
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume()
  }
  // Warm up Web Speech API voices
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices()
    // Speak a silent utterance to unlock TTS on iOS
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
    window.speechSynthesis.cancel()
  }
  // Store unlock flag in sessionStorage so session page knows
  sessionStorage.setItem('audioUnlocked', '1')
}

export function isAudioUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem('audioUnlocked') === '1'
}

export function speakChant(text: string, onDone?: () => void): void {
  if (!text || typeof window === 'undefined') return
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()

  function doSpeak() {
    // Speak chant 3 times for stadium effect
    let count = 0
    const sayOnce = () => {
      if (count >= 3) { onDone?.(); return }
      count++
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.8
      u.pitch = 1.1
      u.volume = 1
      // Pick best available English voice
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

  // Voices may not be loaded yet — wait if needed
  const voices = synth.getVoices()
  if (voices.length > 0) {
    doSpeak()
  } else {
    synth.onvoiceschanged = () => { synth.onvoiceschanged = null; doSpeak() }
    // Fallback timeout in case onvoiceschanged never fires
    setTimeout(doSpeak, 500)
  }
}

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
    // Wake lock not supported or denied — silently ignore
  }
}

export function releaseWakeLock(): void {
  _wakeLock?.release()
  _wakeLock = null
}
