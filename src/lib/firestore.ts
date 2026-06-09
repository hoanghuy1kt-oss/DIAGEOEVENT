import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import type { AppState, Category, Team, VoteCount, VoteSession, User } from '@/types'

// Detect if Firebase is configured. If not, fallback to Mock Mode.
const isMockMode =
  !import.meta.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  import.meta.env.NEXT_PUBLIC_FIREBASE_API_KEY === 'your_api_key'

// ─── Mock Database Store (Local Storage + PubSub) ─────────────────────────────

interface MockDB {
  appState: AppState
  sessions: Record<string, VoteSession>
  votes: Record<string, { sessionId: string; userId: string; categoryId: string; teamId: string; votedAt: string }>
  categories: Category[]
  teams: Team[]
  users: User[]
}

const MOCK_STORAGE_KEY = 'diageo_mock_db'

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Performance: Best Dance Group', description: 'Nhóm nhảy xuất sắc nhất đêm nay', mediaUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&q=80&w=600', mediaType: 'image', teamId: 'team-1' },
  { id: 'cat-2', name: 'Design: Creative Booth', description: 'Gian hàng trang trí sáng tạo nhất', mediaUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=600', mediaType: 'image', teamId: 'team-2' },
]

function getMockDB(): MockDB {
  if (typeof window === 'undefined') {
    return {
      appState: { currentSessionId: null, state: 'waiting', showLeaderboard: false },
      sessions: {},
      votes: {},
      categories: DEFAULT_CATEGORIES,
      teams: [],
      users: []
    }
  }

  const stored = localStorage.getItem(MOCK_STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      // ignore
    }
  }

  // Seeding
  const activeSessionId = 'mock_session_active'
  const db: MockDB = {
    appState: { currentSessionId: activeSessionId, state: 'active', showLeaderboard: false },
    sessions: {
      [activeSessionId]: {
        id: activeSessionId,
        categoryId: 'cat-1',
        startedAt: new Date(),
        duration: 600,
        forceStopped: false,
        stoppedAt: null,
      }
    },
    votes: {},
    categories: DEFAULT_CATEGORIES,
    teams: [
      { id: 'team-1', name: 'Team 1' },
      { id: 'team-2', name: 'Team 2' },
      { id: 'team-3', name: 'Team 3' },
      { id: 'team-4', name: 'Team 4' },
      { id: 'team-5', name: 'Team 5' }
    ],
    users: []
  }

  const TEAMS_DATA: Record<string, string[]> = {
    'team-1': ['Jay', 'Hai', 'Juliana', 'John', 'Tu Van', 'Ray', 'Phuong', 'Lhen', 'Carmen', 'Antoine', 'Shirlene'],
    'team-2': ['Rose Ann', 'Bryna', 'Siew', 'Son', 'Catherine', 'Alex', 'Tuan Anh', 'Marcus', 'Cuong', 'Utpal'],
    'team-3': ['Martin', 'Phil', 'Si Hao', 'Jacquelin', 'Trang', 'Tuyen', 'Anoop', 'Thao', 'Tho'],
    'team-4': ['Jess', 'Poly', 'Aubrey', 'Cherry', 'Samantha', 'Terence', 'Brenda', 'Sara', 'Duong'],
    'team-5': ['Claudia', 'Kent', 'Nicole', 'Tiffany', 'Madhan', 'Loi', 'Cheryl', 'Sophia']
  }

  for (const [teamId, members] of Object.entries(TEAMS_DATA)) {
    for (const member of members) {
      db.users.push({
        id: `user_${teamId}_${member.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: member,
        teamId: teamId
      })
    }
  }

  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db))
  return db
}

function saveMockDB(db: MockDB) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db))
    window.dispatchEvent(new Event('storage'))
  }
}

// Local listeners
const appStateListeners = new Set<(state: AppState) => void>()
const sessionListeners = new Map<string, Set<(session: VoteSession | null) => void>>()
const voterCountListeners = new Map<string, Set<(count: number) => void>>()
const voteCountsListeners = new Map<string, Set<(counts: Record<string, number>) => void>>()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    const db = getMockDB()
    appStateListeners.forEach(cb => cb(db.appState))
    
    sessionListeners.forEach((listeners, sessionId) => {
      const session = db.sessions[sessionId] || null
      if (session && typeof session.startedAt === 'string') {
        session.startedAt = new Date(session.startedAt)
      }
      if (session && typeof session.stoppedAt === 'string') {
        session.stoppedAt = new Date(session.stoppedAt)
      }
      listeners.forEach(cb => cb(session))
    })
    
    voterCountListeners.forEach((listeners, sessionId) => {
      const votes = Object.values(db.votes).filter(v => v.sessionId === sessionId)
      listeners.forEach(cb => cb(votes.length))
    })

    voteCountsListeners.forEach((listeners, sessionId) => {
      const counts: Record<string, number> = {}
      Object.values(db.votes)
        .filter(v => v.sessionId === sessionId)
        .forEach(v => {
          counts[v.categoryId] = (counts[v.categoryId] ?? 0) + 1
        })
      listeners.forEach(cb => cb(counts))
    })
  })
}

// ─── App State ───────────────────────────────────────────────────────────────

export function subscribeToAppState(callback: (state: AppState) => void) {
  if (isMockMode) {
    const db = getMockDB()
    setTimeout(() => callback(db.appState), 0)
    appStateListeners.add(callback)
    return () => {
      appStateListeners.delete(callback)
    }
  }

  const ref = doc(db, 'appState', 'global')
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as AppState)
      } else {
        callback({ currentSessionId: null, state: 'waiting', showLeaderboard: false })
      }
    },
    (err) => {
      console.error('Firestore subscribeToAppState error:', err)
      callback({ currentSessionId: null, state: 'waiting', showLeaderboard: false })
    }
  )
}

export async function setAppState(
  state: 'waiting' | 'active' | 'leaderboard',
  showLeaderboard = false,
  currentSessionId: string | null = null,
) {
  if (isMockMode) {
    const db = getMockDB()
    db.appState = { state, showLeaderboard, currentSessionId }
    saveMockDB(db)
    appStateListeners.forEach(cb => cb(db.appState))
    return
  }

  const ref = doc(db, 'appState', 'global')
  await setDoc(ref, { state, showLeaderboard, currentSessionId }, { merge: true })
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function startSession(categoryId: string, duration: number): Promise<string> {
  if (isMockMode) {
    const db = getMockDB()
    const sessionId = `mock_session_${Date.now()}`
    const newSession: VoteSession = {
      id: sessionId,
      categoryId,
      startedAt: new Date(),
      duration,
      forceStopped: false,
      stoppedAt: null,
    }
    db.sessions[sessionId] = newSession
    db.appState = { currentSessionId: sessionId, state: 'active', showLeaderboard: false }
    saveMockDB(db)
    appStateListeners.forEach(cb => cb(db.appState))
    return sessionId
  }

  const sessionRef = await addDoc(collection(db, 'sessions'), {
    categoryId,
    startedAt: serverTimestamp(),
    duration,
    forceStopped: false,
    stoppedAt: null,
  })
  await setDoc(
    doc(db, 'appState', 'global'),
    { currentSessionId: sessionRef.id, state: 'active', showLeaderboard: false },
    { merge: true },
  )
  return sessionRef.id
}

export async function forceStopSession(sessionId: string) {
  if (isMockMode) {
    const db = getMockDB()
    if (db.sessions[sessionId]) {
      db.sessions[sessionId].forceStopped = true
      db.sessions[sessionId].stoppedAt = new Date()
    }
    db.appState.state = 'leaderboard'
    db.appState.showLeaderboard = false
    saveMockDB(db)
    appStateListeners.forEach(cb => cb(db.appState))
    const sListeners = sessionListeners.get(sessionId)
    if (sListeners) {
      sListeners.forEach(cb => cb(db.sessions[sessionId]))
    }
    return
  }

  await updateDoc(doc(db, 'sessions', sessionId), {
    forceStopped: true,
    stoppedAt: serverTimestamp(),
  })
  await setDoc(
    doc(db, 'appState', 'global'),
    { state: 'leaderboard', showLeaderboard: false },
    { merge: true },
  )
}

export function subscribeToSession(
  sessionId: string,
  callback: (session: VoteSession | null) => void,
) {
  if (isMockMode) {
    const db = getMockDB()
    const session = db.sessions[sessionId] || null
    if (session && typeof session.startedAt === 'string') {
      session.startedAt = new Date(session.startedAt)
    }
    if (session && typeof session.stoppedAt === 'string') {
      session.stoppedAt = new Date(session.stoppedAt)
    }
    setTimeout(() => callback(session), 0)
    if (!sessionListeners.has(sessionId)) {
      sessionListeners.set(sessionId, new Set())
    }
    sessionListeners.get(sessionId)!.add(callback)
    return () => {
      const set = sessionListeners.get(sessionId)
      if (set) {
        set.delete(callback)
        if (set.size === 0) sessionListeners.delete(sessionId)
      }
    }
  }

  const ref = doc(db, 'sessions', sessionId)
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        callback({
          id: snap.id,
          categoryId: data.categoryId,
          startedAt: (data.startedAt as Timestamp)?.toDate() ?? new Date(),
          duration: data.duration,
          forceStopped: data.forceStopped,
          stoppedAt: data.stoppedAt ? (data.stoppedAt as Timestamp).toDate() : null,
        })
      } else {
        callback(null)
      }
    },
    (err) => {
      console.error('Firestore subscribeToSession error:', err)
      callback(null)
    }
  )
}

// ─── Votes ────────────────────────────────────────────────────────────────────

export async function castVote(
  sessionId: string,
  userId: string,
  categoryId: string,
  teamId: string,
) {
  if (isMockMode) {
    const db = getMockDB()
    const voteId = `${sessionId}_${userId}`
    db.votes[voteId] = {
      sessionId,
      userId,
      categoryId,
      teamId,
      votedAt: new Date().toISOString()
    }
    saveMockDB(db)
    
    // Notify local listeners
    const votes = Object.values(db.votes).filter(v => v.sessionId === sessionId)
    const vListeners = voterCountListeners.get(sessionId)
    if (vListeners) {
      vListeners.forEach(cb => cb(votes.length))
    }
    const cListeners = voteCountsListeners.get(sessionId)
    if (cListeners) {
      const counts: Record<string, number> = {}
      votes.forEach(v => {
        counts[v.categoryId] = (counts[v.categoryId] ?? 0) + 1
      })
      cListeners.forEach(cb => cb(counts))
    }
    return
  }

  const voteId = `${sessionId}_${userId}`
  await setDoc(doc(db, 'votes', voteId), {
    sessionId,
    userId,
    categoryId,
    teamId,
    votedAt: serverTimestamp(),
  })
}

export async function hasVoted(sessionId: string, userId: string): Promise<boolean> {
  if (isMockMode) {
    const db = getMockDB()
    const voteId = `${sessionId}_${userId}`
    return !!db.votes[voteId]
  }

  const voteId = `${sessionId}_${userId}`
  const snap = await getDoc(doc(db, 'votes', voteId))
  return snap.exists()
}

export async function getVoteCounts(sessionId: string): Promise<Record<string, number>> {
  if (isMockMode) {
    const db = getMockDB()
    const counts: Record<string, number> = {}
    Object.values(db.votes)
      .filter(v => v.sessionId === sessionId)
      .forEach(v => {
        counts[v.categoryId] = (counts[v.categoryId] ?? 0) + 1
      })
    return counts
  }

  const q = query(collection(db, 'votes'), where('sessionId', '==', sessionId))
  const snap = await getDocs(q)
  const counts: Record<string, number> = {}
  snap.forEach((d) => {
    const categoryId = d.data().categoryId as string
    counts[categoryId] = (counts[categoryId] ?? 0) + 1
  })
  return counts
}

export function subscribeToVoteCounts(
  sessionId: string,
  callback: (counts: Record<string, number>) => void,
) {
  if (isMockMode) {
    const db = getMockDB()
    const counts: Record<string, number> = {}
    Object.values(db.votes)
      .filter(v => v.sessionId === sessionId)
      .forEach(v => {
        counts[v.categoryId] = (counts[v.categoryId] ?? 0) + 1
      })
    setTimeout(() => callback(counts), 0)

    if (!voteCountsListeners.has(sessionId)) {
      voteCountsListeners.set(sessionId, new Set())
    }
    voteCountsListeners.get(sessionId)!.add(callback)
    return () => {
      const set = voteCountsListeners.get(sessionId)
      if (set) {
        set.delete(callback)
        if (set.size === 0) voteCountsListeners.delete(sessionId)
      }
    }
  }

  const q = query(collection(db, 'votes'), where('sessionId', '==', sessionId))
  return onSnapshot(q, (snap) => {
    const counts: Record<string, number> = {}
    snap.forEach((d) => {
      const categoryId = d.data().categoryId as string
      counts[categoryId] = (counts[categoryId] ?? 0) + 1
    })
    callback(counts)
  })
}

export function subscribeToVoterCount(
  sessionId: string,
  callback: (count: number) => void,
) {
  if (isMockMode) {
    const db = getMockDB()
    const count = Object.values(db.votes).filter(v => v.sessionId === sessionId).length
    setTimeout(() => callback(count), 0)

    if (!voterCountListeners.has(sessionId)) {
      voterCountListeners.set(sessionId, new Set())
    }
    voterCountListeners.get(sessionId)!.add(callback)
    return () => {
      const set = voterCountListeners.get(sessionId)
      if (set) {
        set.delete(callback)
        if (set.size === 0) voterCountListeners.delete(sessionId)
      }
    }
  }

  const q = query(collection(db, 'votes'), where('sessionId', '==', sessionId))
  return onSnapshot(q, (snap) => callback(snap.size))
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  if (isMockMode) {
    const db = getMockDB()
    return db.categories
  }

  const snap = await getDocs(collection(db, 'categories'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
}

export async function createCategory(
  data: Omit<Category, 'id'>,
): Promise<string> {
  if (isMockMode) {
    const db = getMockDB()
    const id = `mock_cat_${Date.now()}`
    const newCat = { id, ...data }
    db.categories.push(newCat)
    saveMockDB(db)
    return id
  }

  const ref = await addDoc(collection(db, 'categories'), data)
  return ref.id
}

export async function deleteCategory(id: string) {
  if (isMockMode) {
    const db = getMockDB()
    db.categories = db.categories.filter(c => c.id !== id)
    saveMockDB(db)
    return
  }

  await deleteDoc(doc(db, 'categories', id))
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  if (isMockMode) {
    const db = getMockDB()
    return db.teams
  }

  const snap = await getDocs(collection(db, 'teams'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Team))
}

export async function seedDefaultTeams() {
  if (isMockMode) {
    return
  }

  // Check if already seeded
  const teamsSnap = await getDocs(collection(db, 'teams'))
  const usersSnap = await getDocs(collection(db, 'users'))
  if (teamsSnap.size === 5 && usersSnap.size === 47) {
    return
  }

  // Remove old teams if they exist
  const oldTeamIds = ['diageo-vn', 'bia-saigon', 'tiger', 'heineken', 'partnership']
  for (const id of oldTeamIds) {
    try {
      await deleteDoc(doc(db, 'teams', id))
    } catch (e) {
      console.error('Error deleting old team:', id, e)
    }
  }

  const defaultTeams = [
    { id: 'team-1', name: 'Team 1' },
    { id: 'team-2', name: 'Team 2' },
    { id: 'team-3', name: 'Team 3' },
    { id: 'team-4', name: 'Team 4' },
    { id: 'team-5', name: 'Team 5' },
  ]
  for (const team of defaultTeams) {
    await setDoc(doc(db, 'teams', team.id), { name: team.name }, { merge: true })
  }

  // Define updated team members (excluding inactive ones marked with fire icons)
  const TEAMS_DATA: Record<string, string[]> = {
    'team-1': ['Jay', 'Hai', 'Juliana', 'John', 'Tu Van', 'Ray', 'Phuong', 'Lhen', 'Carmen', 'Antoine', 'Shirlene'],
    'team-2': ['Rose Ann', 'Bryna', 'Siew', 'Son', 'Catherine', 'Alex', 'Tuan Anh', 'Marcus', 'Cuong', 'Utpal'],
    'team-3': ['Martin', 'Phil', 'Si Hao', 'Jacquelin', 'Trang', 'Tuyen', 'Anoop', 'Thao', 'Tho'],
    'team-4': ['Jess', 'Poly', 'Aubrey', 'Cherry', 'Samantha', 'Terence', 'Brenda', 'Sara', 'Duong'],
    'team-5': ['Claudia', 'Kent', 'Nicole', 'Tiffany', 'Madhan', 'Loi', 'Cheryl', 'Sophia']
  }

  // Clear legacy test users
  for (const userDoc of usersSnap.docs) {
    try {
      await deleteDoc(doc(db, 'users', userDoc.id))
    } catch (e) {
      console.error('Error deleting user:', userDoc.id, e)
    }
  }

  // Seed active users
  for (const [teamId, members] of Object.entries(TEAMS_DATA)) {
    for (const member of members) {
      const docId = `user_${teamId}_${member.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      try {
        await setDoc(doc(db, 'users', docId), {
          name: member,
          teamId: teamId,
          createdAt: serverTimestamp()
        })
      } catch (e) {
        console.error('Error seeding user:', member, e)
      }
    }
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function createUser(name: string, teamId: string): Promise<string> {
  if (isMockMode) {
    const db = getMockDB()
    const id = `mock_user_${Date.now()}`
    db.users.push({ id, name, teamId })
    saveMockDB(db)
    return id
  }

  const ref = await addDoc(collection(db, 'users'), {
    name,
    teamId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getUsers() {
  if (isMockMode) {
    const db = getMockDB()
    return db.users
  }

  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function deleteUser(id: string) {
  if (isMockMode) {
    const db = getMockDB()
    db.users = db.users.filter(u => u.id !== id)
    saveMockDB(db)
    return
  }

  await deleteDoc(doc(db, 'users', id))
}

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

export async function buildLeaderboard(
  sessionId: string,
  categories: Category[],
): Promise<VoteCount[]> {
  const counts = await getVoteCounts(sessionId)
  return categories
    .map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      count: counts[c.id] ?? 0,
      teamId: c.teamId,
    }))
    .sort((a, b) => b.count - a.count)
}
