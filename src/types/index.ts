export interface User {
  id: string
  name: string
  teamId: string
}

export interface Team {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  description: string
  mediaUrl: string
  mediaType: 'image' | 'video' | 'text'
  teamId: string
}

export interface VoteSession {
  id: string
  categoryId: string
  startedAt: Date
  duration: number
  forceStopped: boolean
  stoppedAt: Date | null
}

export interface AppState {
  currentSessionId: string | null
  state: 'waiting' | 'active' | 'leaderboard'
  showLeaderboard: boolean
}

export interface Vote {
  sessionId: string
  userId: string
  categoryId: string
  teamId: string
  votedAt: Date
}

export interface VoteCount {
  categoryId: string
  categoryName: string
  count: number
  teamId: string
}
