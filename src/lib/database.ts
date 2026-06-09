import { db } from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  collection, 
  getDocs, 
  writeBatch, 
  updateDoc 
} from 'firebase/firestore';

export interface Member {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  members: Member[];
  description?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

export interface VotingSession {
  id: string;
  title: string;
  status: 'waiting' | 'countdown' | 'voting' | 'ended';
  countdownStartedAt: number | null; // Unix timestamp
  votingStartedAt: number | null;    // Unix timestamp
  duration: number;                  // seconds
  votes: Record<string, string[]>;   // voterId -> array of teamIds voted for
  teamDetails?: Record<string, { description: string; mediaUrl?: string; mediaType?: 'image' | 'video' }>;
  maxVotes: number;                  // max votes per voter
}

export interface MockDB {
  teams: Team[];
  sessions: VotingSession[];
  currentSessionId: string | null;
}

const MOCK_STORAGE_KEY = 'spg_voting_db';

// Default mock data to seed
const DEFAULT_TEAMS_DATA: Record<string, string[]> = {
  'team-1': ['Jay', 'Hai', 'Juliana', 'John', 'Tu Van', 'Ray', 'Phuong', 'Lhen', 'Carmen', 'Antoine', 'Shirlene'],
  'team-2': ['Rose Ann', 'Bryna', 'Siew', 'Son', 'Catherine', 'Alex', 'Tuan Anh', 'Marcus', 'Cuong', 'Utpal'],
  'team-3': ['Martin', 'Phil', 'Si Hao', 'Jacquelin', 'Trang', 'Tuyen', 'Anoop', 'Thao', 'Tho'],
  'team-4': ['Jess', 'Poly', 'Aubrey', 'Cherry', 'Samantha', 'Terence', 'Brenda', 'Sara', 'Duong'],
  'team-5': ['Claudia', 'Kent', 'Nicole', 'Tiffany', 'Madhan', 'Loi', 'Cheryl', 'Sophia']
};

const TEAM_NAMES: Record<string, string> = {
  'team-1': 'Team 1',
  'team-2': 'Team 2',
  'team-3': 'Team 3',
  'team-4': 'Team 4',
  'team-5': 'Team 5'
};

const MOCK_TEAM_DETAILS: Record<string, { description: string; mediaUrl: string; mediaType: 'image' | 'video' }> = {
  'team-1': {
    description: '',
    mediaUrl: '',
    mediaType: 'image'
  },
  'team-2': {
    description: '',
    mediaUrl: '',
    mediaType: 'image'
  },
  'team-3': {
    description: '',
    mediaUrl: '',
    mediaType: 'image'
  },
  'team-4': {
    description: '',
    mediaUrl: '',
    mediaType: 'image'
  },
  'team-5': {
    description: '',
    mediaUrl: '',
    mediaType: 'image'
  }
};

function seedDB(): MockDB {
  const teams: Team[] = Object.entries(DEFAULT_TEAMS_DATA).map(([teamId, members]) => {
    return {
      id: teamId,
      name: TEAM_NAMES[teamId] || `Team ${teamId.split('-')[1]}`,
      members: members.map((name, index) => ({
        id: `${teamId}-user-${index + 1}-${Math.random().toString(36).substring(2, 7)}`,
        name
      })),
      description: '',
      mediaUrl: '',
      mediaType: 'image'
    };
  });

  const initialSession: VotingSession = {
    id: 'session-1',
    title: 'Best Performance Voting',
    status: 'waiting',
    countdownStartedAt: null,
    votingStartedAt: null,
    duration: 300,
    votes: {},
    maxVotes: 1
  };

  const db: MockDB = {
    teams,
    sessions: [initialSession],
    currentSessionId: null
  };

  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
  return db;
}

// Global cached state populated from Firestore (or LocalStorage)
let localDBState: MockDB = {
  teams: [],
  sessions: [],
  currentSessionId: null
};

// Flags and settings
let useFirebase = true;
const dbListeners = new Set<(db: MockDB) => void>();
const currentVotesCache: Record<string, Record<string, string[]>> = {};

// Helper to notify listeners
function triggerListeners() {
  dbListeners.forEach(listener => listener({ ...localDBState }));
}

// Local Storage Fallback Implementation
function getLocalStorageDB(): MockDB {
  if (typeof window === 'undefined') {
    return { teams: [], sessions: [], currentSessionId: null };
  }
  const data = localStorage.getItem(MOCK_STORAGE_KEY);
  if (!data) {
    return seedDB();
  }
  try {
    const parsed = JSON.parse(data) as MockDB;
    // self healing migrations
    let needsUpdate = false;
    parsed.teams.forEach(t => {
      const details = MOCK_TEAM_DETAILS[t.id];
      if (details) {
        if (t.description === undefined) { t.description = details.description; needsUpdate = true; }
        if (t.mediaUrl === undefined) { t.mediaUrl = details.mediaUrl; needsUpdate = true; }
        if (t.mediaType === undefined) { t.mediaType = details.mediaType; needsUpdate = true; }
      }
    });
    parsed.sessions.forEach(s => {
      if (s.maxVotes === undefined) {
        s.maxVotes = 1;
        needsUpdate = true;
      }
    });
    if (needsUpdate) {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (e) {
    return seedDB();
  }
}

function saveLocalStorageDB(db: MockDB) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
    window.dispatchEvent(new Event('storage'));
  }
}

// Global initialization of real-time subscriptions
let activeVotesUnsubscribe: (() => void) | null = null;

function subscribeToActiveVotes(sessionId: string | null) {
  if (activeVotesUnsubscribe) {
    activeVotesUnsubscribe();
    activeVotesUnsubscribe = null;
  }
  if (!sessionId || !useFirebase) return;

  try {
    activeVotesUnsubscribe = onSnapshot(
      collection(db, 'sessions', sessionId, 'votes'),
      (snapshot) => {
        const votes: Record<string, string[]> = {};
        snapshot.forEach(vDoc => {
          votes[vDoc.id] = vDoc.data().teamIds || [];
        });
        currentVotesCache[sessionId] = votes;

        // Apply votes to the session in cache
        const sessionIndex = localDBState.sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
          localDBState.sessions = [
            ...localDBState.sessions.slice(0, sessionIndex),
            { ...localDBState.sessions[sessionIndex], votes },
            ...localDBState.sessions.slice(sessionIndex + 1)
          ];
          triggerListeners();
        }
      },
      (err) => {
        console.error('Error listening to votes:', err);
      }
    );
  } catch (e) {
    console.error('Failed to setup votes snapshot:', e);
  }
}

async function migrateExistingFirestoreData() {
  try {
    const globalRef = doc(db, 'config', 'global');
    const globalSnap = await getDoc(globalRef);
    if (globalSnap.exists()) {
      const data = globalSnap.data();
      const teams = data.teams || [];
      let updated = false;
      const updatedTeams = teams.map((t: any) => {
        if (
          t.description?.includes('Allumer le feu') ||
          t.description?.includes('Welcome to Hoi An') ||
          t.description?.includes('Vietnamese Lotus Soul') ||
          t.description?.includes('Team Power') ||
          t.description?.includes('Green Planet') ||
          t.mediaUrl?.includes('unsplash.com')
        ) {
          updated = true;
          return {
            ...t,
            description: '',
            mediaUrl: '',
            mediaType: 'image'
          };
        }
        return t;
      });

      if (updated) {
        await setDoc(globalRef, { teams: updatedTeams }, { merge: true });
        console.log('Successfully migrated global teams to clear mock details.');
      }
    }
  } catch (e) {
    console.error('Migration of global teams failed:', e);
  }
}

async function migrateExistingSessions() {
  try {
    const sessionsSnap = await getDocs(collection(db, 'sessions'));
    const batch = writeBatch(db);
    let updatedAny = false;
    sessionsSnap.forEach(sDoc => {
      const data = sDoc.data();
      if (data.teamDetails) {
        let sessionUpdated = false;
        const updatedTeamDetails = { ...data.teamDetails };
        Object.entries(updatedTeamDetails).forEach(([teamId, details]: [string, any]) => {
          if (
            details.description?.includes('Allumer le feu') ||
            details.description?.includes('Welcome to Hoi An') ||
            details.description?.includes('Vietnamese Lotus Soul') ||
            details.description?.includes('Team Power') ||
            details.description?.includes('Green Planet') ||
            details.mediaUrl?.includes('unsplash.com')
          ) {
            updatedTeamDetails[teamId] = {
              description: '',
              mediaUrl: '',
              mediaType: 'image'
            };
            sessionUpdated = true;
          }
        });

        if (sessionUpdated) {
          batch.update(sDoc.ref, { teamDetails: updatedTeamDetails });
          updatedAny = true;
        }
      }
    });

    if (updatedAny) {
      await batch.commit();
      console.log('Successfully migrated sessions to clear mock details.');
    }
  } catch (e) {
    console.error('Sessions migration failed:', e);
  }
}

// Seeding logic for Firestore
async function checkAndSeedFirestore() {
  try {
    const globalRef = doc(db, 'config', 'global');
    const globalSnap = await getDoc(globalRef);
    if (!globalSnap.exists()) {
      const teams: Team[] = Object.entries(DEFAULT_TEAMS_DATA).map(([teamId, members]) => {
        return {
          id: teamId,
          name: TEAM_NAMES[teamId] || `Team ${teamId.split('-')[1]}`,
          members: members.map((name, index) => ({
            id: `${teamId}-user-${index + 1}-${Math.random().toString(36).substring(2, 7)}`,
            name
          })),
          description: '',
          mediaUrl: '',
          mediaType: 'image'
        };
      });

      await setDoc(globalRef, {
        teams,
        currentSessionId: null
      });
    } else {
      // Run migrations for existing data to clear mock details
      await migrateExistingFirestoreData();
      await migrateExistingSessions();
    }
  } catch (e) {
    console.error('Firestore seeding failed, falling back to local mode:', e);
    useFirebase = false;
  }
}

// Start listeners if on client side
if (typeof window !== 'undefined') {
  // Check and seed Firestore first
  checkAndSeedFirestore().then(() => {
    if (!useFirebase) {
      // Fallback local storage event listener
      window.addEventListener('storage', () => {
        localDBState = getLocalStorageDB();
        triggerListeners();
      });
      localDBState = getLocalStorageDB();
      triggerListeners();
      return;
    }

    // Subscribe to global configurations
    onSnapshot(doc(db, 'config', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        localDBState.teams = data.teams || [];
        const nextSessionId = data.currentSessionId || null;
        if (nextSessionId !== localDBState.currentSessionId) {
          localDBState.currentSessionId = nextSessionId;
          subscribeToActiveVotes(nextSessionId);
        }
        triggerListeners();
      }
    }, (err) => {
      console.warn('Firestore global sync failed, switching to local storage:', err);
      useFirebase = false;
      localDBState = getLocalStorageDB();
      triggerListeners();
    });

    // Subscribe to sessions collection
    onSnapshot(collection(db, 'sessions'), (snapshot) => {
      const sessions: VotingSession[] = [];
      snapshot.forEach(sDoc => {
        const data = sDoc.data() as Omit<VotingSession, 'votes'>;
        const sessionId = sDoc.id;
        sessions.push({
          ...data,
          id: sessionId,
          votes: currentVotesCache[sessionId] || {}
        });
      });
      localDBState.sessions = sessions;
      // Re-link votes for active session if it loaded after sessions
      if (localDBState.currentSessionId) {
        const activeS = localDBState.sessions.find(s => s.id === localDBState.currentSessionId);
        if (activeS && currentVotesCache[localDBState.currentSessionId]) {
          activeS.votes = currentVotesCache[localDBState.currentSessionId];
        }
      }
      triggerListeners();
    }, (err) => {
      console.error('Firestore sessions sync failed:', err);
    });
  });
}

export function getDB(): MockDB {
  if (!useFirebase) {
    return getLocalStorageDB();
  }
  return localDBState;
}

export function saveDB(dbState: MockDB) {
  if (!useFirebase) {
    saveLocalStorageDB(dbState);
    return;
  }
  setDoc(doc(db, 'config', 'global'), {
    teams: dbState.teams,
    currentSessionId: dbState.currentSessionId
  }, { merge: true }).catch(err => console.error('saveDB failed:', err));

  // Save all sessions to Firestore so that teamDetails edits are saved
  dbState.sessions.forEach((session) => {
    const { votes, ...sessionData } = session;
    setDoc(doc(db, 'sessions', session.id), sessionData, { merge: true })
      .catch(err => console.error(`saveDB failed to write session ${session.id}:`, err));
  });
}

export function subscribeToDB(callback: (db: MockDB) => void) {
  dbListeners.add(callback);
  callback(getDB());
  return () => {
    dbListeners.delete(callback);
  };
}

// ─── Team & Member Actions ───────────────────────────────────────────────────

export async function updateTeamName(teamId: string, newName: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const team = dbState.teams.find(t => t.id === teamId);
    if (team) {
      team.name = newName;
      saveLocalStorageDB(dbState);
    }
    return;
  }
  const dbState = getDB();
  const updatedTeams = dbState.teams.map(t => t.id === teamId ? { ...t, name: newName } : t);
  await setDoc(doc(db, 'config', 'global'), { teams: updatedTeams }, { merge: true });
}

export async function setTeamCount(count: number) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const currentCount = dbState.teams.length;
    if (count === currentCount) return;

    if (count < currentCount) {
      dbState.teams = dbState.teams.slice(0, count);
    } else {
      for (let i = currentCount; i < count; i++) {
        const teamId = `team-${i + 1}`;
        dbState.teams.push({
          id: teamId,
          name: `Team ${i + 1}`,
          members: []
        });
      }
    }
    saveLocalStorageDB(dbState);
    return;
  }

  const dbState = getDB();
  const currentCount = dbState.teams.length;
  if (count === currentCount) return;

  let newTeams = [...dbState.teams];
  if (count < currentCount) {
    newTeams = newTeams.slice(0, count);
  } else {
    for (let i = currentCount; i < count; i++) {
      const teamId = `team-${i + 1}`;
      newTeams.push({
        id: teamId,
        name: `Team ${i + 1}`,
        members: []
      });
    }
  }
  await setDoc(doc(db, 'config', 'global'), { teams: newTeams }, { merge: true });
}

export async function addMember(teamId: string, name: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const team = dbState.teams.find(t => t.id === teamId);
    if (team) {
      const newId = `${teamId}-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      team.members.push({ id: newId, name });
      saveLocalStorageDB(dbState);
    }
    return;
  }

  const dbState = getDB();
  const newTeams = dbState.teams.map(t => {
    if (t.id === teamId) {
      const newId = `${teamId}-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      return {
        ...t,
        members: [...t.members, { id: newId, name }]
      };
    }
    return t;
  });
  await setDoc(doc(db, 'config', 'global'), { teams: newTeams }, { merge: true });
}

export async function deleteMember(teamId: string, memberId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const team = dbState.teams.find(t => t.id === teamId);
    if (team) {
      team.members = team.members.filter(m => m.id !== memberId);
      saveLocalStorageDB(dbState);
    }
    return;
  }

  const dbState = getDB();
  const newTeams = dbState.teams.map(t => {
    if (t.id === teamId) {
      return {
        ...t,
        members: t.members.filter(m => m.id !== memberId)
      };
    }
    return t;
  });
  await setDoc(doc(db, 'config', 'global'), { teams: newTeams }, { merge: true });
}

export async function swapMember(memberId: string, fromTeamId: string, toTeamId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const sourceTeam = dbState.teams.find(t => t.id === fromTeamId);
    const destTeam = dbState.teams.find(t => t.id === toTeamId);

    if (sourceTeam && destTeam) {
      const memberIndex = sourceTeam.members.findIndex(m => m.id === memberId);
      if (memberIndex !== -1) {
        const [member] = sourceTeam.members.splice(memberIndex, 1);
        destTeam.members.push(member);
        saveLocalStorageDB(dbState);
      }
    }
    return;
  }

  const dbState = getDB();
  const sourceTeam = dbState.teams.find(t => t.id === fromTeamId);
  const destTeam = dbState.teams.find(t => t.id === toTeamId);
  if (sourceTeam && destTeam) {
    const member = sourceTeam.members.find(m => m.id === memberId);
    if (member) {
      const newTeams = dbState.teams.map(t => {
        if (t.id === fromTeamId) {
          return { ...t, members: t.members.filter(m => m.id !== memberId) };
        }
        if (t.id === toTeamId) {
          return { ...t, members: [...t.members, member] };
        }
        return t;
      });
      await setDoc(doc(db, 'config', 'global'), { teams: newTeams }, { merge: true });
    }
  }
}

// ─── Session & Voting Actions ─────────────────────────────────────────────────

export async function createSession(title: string, durationSeconds: number, maxVotes: number = 1) {
  const sessionId = `session-${Date.now()}`;
  const newSession: Omit<VotingSession, 'votes'> = {
    id: sessionId,
    title,
    status: 'waiting',
    countdownStartedAt: null,
    votingStartedAt: null,
    duration: durationSeconds,
    maxVotes
  };

  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    dbState.sessions.push({ ...newSession, votes: {} });
    saveLocalStorageDB(dbState);
    return sessionId;
  }

  await setDoc(doc(db, 'sessions', sessionId), newSession);
  return sessionId;
}

export async function triggerCountdown(sessionId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const session = dbState.sessions.find(s => s.id === sessionId);
    if (session) {
      session.status = 'countdown';
      session.countdownStartedAt = Date.now();
      session.votingStartedAt = null;
      dbState.currentSessionId = sessionId;
      saveLocalStorageDB(dbState);
    }
    return;
  }

  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'countdown',
    countdownStartedAt: Date.now(),
    votingStartedAt: null
  });
  await setDoc(doc(db, 'config', 'global'), { currentSessionId: sessionId }, { merge: true });
}

export async function startVoting(sessionId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const session = dbState.sessions.find(s => s.id === sessionId);
    if (session) {
      session.status = 'voting';
      session.votingStartedAt = Date.now();
      dbState.currentSessionId = sessionId;
      saveLocalStorageDB(dbState);
    }
    return;
  }

  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'voting',
    votingStartedAt: Date.now()
  });
  await setDoc(doc(db, 'config', 'global'), { currentSessionId: sessionId }, { merge: true });
}

export async function forceStopSession(sessionId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const session = dbState.sessions.find(s => s.id === sessionId);
    if (session) {
      session.status = 'ended';
      saveLocalStorageDB(dbState);
    }
    return;
  }

  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'ended'
  });
}

export async function switchSession(sessionId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    if (dbState.sessions.some(s => s.id === sessionId)) {
      dbState.currentSessionId = sessionId;
      saveLocalStorageDB(dbState);
    }
    return;
  }

  await setDoc(doc(db, 'config', 'global'), { currentSessionId: sessionId }, { merge: true });
}

export async function deleteSession(sessionId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    dbState.sessions = dbState.sessions.filter(s => s.id !== sessionId);
    if (dbState.currentSessionId === sessionId) {
      dbState.currentSessionId = dbState.sessions.length > 0 ? dbState.sessions[0].id : null;
    }
    saveLocalStorageDB(dbState);
    return;
  }

  await deleteDoc(doc(db, 'sessions', sessionId));
  const dbState = getDB();
  if (dbState.currentSessionId === sessionId) {
    const remaining = dbState.sessions.filter(s => s.id !== sessionId);
    const nextId = remaining.length > 0 ? remaining[0].id : null;
    await setDoc(doc(db, 'config', 'global'), { currentSessionId: nextId }, { merge: true });
  }
}

export async function updateSessionInfo(sessionId: string, title: string, duration: number, maxVotes: number) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const session = dbState.sessions.find(s => s.id === sessionId);
    if (session) {
      session.title = title;
      session.duration = duration;
      session.maxVotes = maxVotes;
      saveLocalStorageDB(dbState);
    }
    return;
  }

  await updateDoc(doc(db, 'sessions', sessionId), {
    title,
    duration,
    maxVotes
  });
}

export async function castVote(sessionId: string, userId: string, teamIds: string[]) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const session = dbState.sessions.find(s => s.id === sessionId);
    if (session && (session.status === 'voting' || session.status === 'countdown')) {
      const limit = session.maxVotes || 1;
      const limitedVotes = teamIds.slice(0, limit);
      session.votes[userId] = limitedVotes;
      saveLocalStorageDB(dbState);
    }
    return;
  }

  const dbState = getDB();
  const session = dbState.sessions.find(s => s.id === sessionId);
  const limit = session?.maxVotes || 1;
  const limitedVotes = teamIds.slice(0, limit);
  await setDoc(doc(db, 'sessions', sessionId, 'votes', userId), { teamIds: limitedVotes });
}

export async function resetDatabase() {
  if (!useFirebase) {
    seedDB();
    return;
  }

  // 1. Reset config/global (using setDoc instead of deleteDoc)
  const globalRef = doc(db, 'config', 'global');
  const defaultTeams: Team[] = Object.entries(DEFAULT_TEAMS_DATA).map(([teamId, members]) => {
    return {
      id: teamId,
      name: TEAM_NAMES[teamId] || `Team ${teamId.split('-')[1]}`,
      members: members.map((name, index) => ({
        id: `${teamId}-user-${index + 1}-${Math.random().toString(36).substring(2, 7)}`,
        name
      })),
      description: '',
      mediaUrl: '',
      mediaType: 'image'
    };
  });
  await setDoc(globalRef, {
    teams: defaultTeams,
    currentSessionId: null
  });

  // 2. Delete all existing sessions in a write batch
  const sessionsSnap = await getDocs(collection(db, 'sessions'));
  const batch = writeBatch(db);
  sessionsSnap.forEach(sDoc => {
    batch.delete(sDoc.ref);
  });
  await batch.commit();
}

export async function resetVotingSessions() {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    dbState.sessions = [];
    dbState.currentSessionId = null;
    saveLocalStorageDB(dbState);
    return;
  }

  // 1. Reset currentSessionId in global config to null
  const globalRef = doc(db, 'config', 'global');
  await setDoc(globalRef, { currentSessionId: null }, { merge: true });

  // 2. Delete all sessions in firestore
  const sessionsSnap = await getDocs(collection(db, 'sessions'));
  const batch = writeBatch(db);
  sessionsSnap.forEach(sDoc => {
    batch.delete(sDoc.ref);
  });
  await batch.commit();
}

export async function resetSessionVotes(sessionId: string) {
  if (!useFirebase) {
    const dbState = getLocalStorageDB();
    const session = dbState.sessions.find(s => s.id === sessionId);
    if (session) {
      session.votes = {};
      session.status = 'waiting';
      session.countdownStartedAt = null;
      session.votingStartedAt = null;
      if (dbState.currentSessionId === sessionId) {
        dbState.currentSessionId = null;
      }
      saveLocalStorageDB(dbState);
    }
    return;
  }

  // 1. Reset currentSessionId in global config if it was active
  const dbState = getDB();
  if (dbState.currentSessionId === sessionId) {
    const globalRef = doc(db, 'config', 'global');
    await setDoc(globalRef, { currentSessionId: null }, { merge: true });
  }

  // 2. Update session doc in firestore
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'waiting',
    countdownStartedAt: null,
    votingStartedAt: null
  });

  // 3. Delete all documents in votes subcollection
  const votesSnap = await getDocs(collection(db, 'sessions', sessionId, 'votes'));
  const batch = writeBatch(db);
  votesSnap.forEach(vDoc => {
    batch.delete(vDoc.ref);
  });
  await batch.commit();
}


// ─── Utilities ───────────────────────────────────────────────────────────────

export function getYouTubeEmbedUrl(url: string | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }
  return null;
}

export function formatDuration(totalSeconds: number): string {
  const rounded = Math.ceil(totalSeconds);
  if (rounded <= 0) return '00:00';
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
