'use client'

import { useState, useEffect } from 'react'
import { subscribeToAppState, subscribeToSession } from '@/lib/firestore'
import { getCategories } from '@/lib/firestore'
import type { AppState, VoteSession, Category } from '@/types'

export function useVoteSession() {
  const [appState, setAppState] = useState<AppState>({
    currentSessionId: null,
    state: 'waiting',
    showLeaderboard: false,
  })
  const [currentSession, setCurrentSession] = useState<VoteSession | null>(null)
  const [currentCategory, setCurrentCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)

  // Subscribe to global app state
  useEffect(() => {
    const unsub = subscribeToAppState((state) => {
      setAppState(state)
      setLoading(false)
    })
    return unsub
  }, [])

  // Subscribe to current session when session id changes
  useEffect(() => {
    if (!appState.currentSessionId) {
      setCurrentSession(null)
      return
    }
    const unsub = subscribeToSession(appState.currentSessionId, (session) => {
      setCurrentSession(session)
    })
    return unsub
  }, [appState.currentSessionId])

  // Load category when session changes
  useEffect(() => {
    if (!currentSession?.categoryId) {
      setCurrentCategory(null)
      return
    }
    getCategories().then((cats) => {
      const found = cats.find((c) => c.id === currentSession.categoryId) ?? null
      setCurrentCategory(found)
    })
  }, [currentSession?.categoryId])

  return { appState, currentSession, currentCategory, loading }
}
