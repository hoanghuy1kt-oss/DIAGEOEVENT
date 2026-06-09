'use client'

import { useState, useEffect } from 'react'

interface CountdownResult {
  remaining: number
  progress: number
  isExpired: boolean
  formatted: string
}

export function useCountdown(startedAt: Date | null, duration: number): CountdownResult {
  const [remaining, setRemaining] = useState(duration)

  useEffect(() => {
    if (!startedAt) return

    const tick = () => {
      const elapsed = (Date.now() - startedAt.getTime()) / 1000
      const rem = Math.max(0, duration - elapsed)
      setRemaining(rem)
    }

    tick()
    const interval = setInterval(tick, 100)
    return () => clearInterval(interval)
  }, [startedAt, duration])

  const progress = duration > 0 ? remaining / duration : 0
  const isExpired = remaining <= 0

  const totalSecs = Math.ceil(remaining)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return { remaining, progress, isExpired, formatted }
}
