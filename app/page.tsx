'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0D0D0D] flex flex-col items-center justify-center px-4">
      {/* Logo / Title */}
      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-14 h-14 bg-[#FF4D00] rounded-full flex items-center justify-center shadow-lg shadow-[#FF4D00]/40">
            <span className="text-3xl font-black text-white">U</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight text-white uppercase">
            ULTRA<span className="text-[#FF4D00]">CHANT</span>
          </h1>
        </div>
        <p className="text-gray-400 text-lg mt-2">
          Synchronize your crowd. One voice. One moment.
        </p>
      </div>

      {/* Buttons */}
      <div className="w-full max-w-sm flex flex-col gap-4">
        <Link href="/create">
          <button className="w-full py-5 bg-[#FF4D00] text-white text-xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#e04400] active:scale-95 transition-all shadow-lg shadow-[#FF4D00]/30">
            CREATE CHANT
          </button>
        </Link>

        <Link href="/join">
          <button className="w-full py-5 bg-transparent border-2 border-[#FF4D00] text-[#FF4D00] text-xl font-black uppercase tracking-widest rounded-2xl hover:bg-[#FF4D00]/10 active:scale-95 transition-all">
            JOIN CHANT
          </button>
        </Link>
      </div>

      {/* Bottom tagline */}
      <p className="mt-16 text-gray-600 text-sm uppercase tracking-widest">
        Powered by Ultra
      </p>
    </main>
  )
}
