'use client'

import { useState, useEffect, useCallback } from 'react'
import type { User } from '@/types'

const STORAGE_KEY = 'diageo_event_user'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as User
        const validTeams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5']
        if (parsed && validTeams.includes(parsed.teamId)) {
          setUser(parsed)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch {
      // ignore parse errors
    }
    setLoading(false)
  }, [])

  const login = useCallback((userData: User) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  return { user, login, logout, loading }
}
