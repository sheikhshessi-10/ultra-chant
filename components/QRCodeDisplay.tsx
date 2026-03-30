'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface Props {
  url: string
  size?: number
}

export default function QRCodeDisplay({ url, size = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !url) return
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: {
        dark: '#FFFFFF',
        light: '#1a1a1a',
      },
    })
  }, [url, size])

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-4 border border-[#333]">
      <canvas ref={canvasRef} className="rounded-xl" />
    </div>
  )
}
