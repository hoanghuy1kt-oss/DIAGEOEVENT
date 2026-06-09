import React, { useState, useEffect } from 'react';
import { 
  getDB, 
  saveDB, 
  subscribeToDB, 
  setTeamCount, 
  addMember, 
  deleteMember, 
  swapMember, 
  createSession, 
  triggerCountdown, 
  startVoting, 
  forceStopSession, 
  switchSession,
  deleteSession,
  updateSessionInfo,
  updateTeamName,
  getYouTubeEmbedUrl,
  formatDuration,
  resetDatabase,
  resetVotingSessions,
  Team, 
  VotingSession 
} from '../lib/database';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('spg_admin_authenticated') === 'true';
  });
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [db, setDb] = useState(getDB());
  const [activeTab, setActiveTab] = useState<'members' | 'sessions'>('sessions');
  const [selectedTeamTabId, setSelectedTeamTabId] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [teamCountInput, setTeamCountInput] = useState(5);

  // Inline edit state for members
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState('');

  // New session state
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDuration, setNewSessionDuration] = useState(300);
  const [newSessionMaxVotes, setNewSessionMaxVotes] = useState(1);

  // Expanded session ID for editing and configuration details
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [editingSessionDuration, setEditingSessionDuration] = useState(300);
  const [editingSessionMaxVotes, setEditingSessionMaxVotes] = useState(1);

  // Selected team to configure details
  const [selectedConfigTeamId, setSelectedConfigTeamId] = useState('');

  // Subscribe to database
  useEffect(() => {
    const unsub = subscribeToDB((freshDb) => {
      setDb(freshDb);
    });
    return () => unsub();
  }, []);

  // Tick every 500ms to force UI re-render for active countdown/voting remaining times
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Update selected team tab on load or when teams change
  useEffect(() => {
    if (db.teams.length > 0 && !selectedTeamTabId) {
      setSelectedTeamTabId(db.teams[0].id);
    }
  }, [db.teams, selectedTeamTabId]);

  // Set default configuration team on load or when teams change
  useEffect(() => {
    if (db.teams.length > 0 && !selectedConfigTeamId) {
      setSelectedConfigTeamId(db.teams[0].id);
    }
  }, [db.teams, selectedConfigTeamId]);

  // Set default team counts input on load
  useEffect(() => {
    if (db.teams.length > 0) {
      setTeamCountInput(db.teams.length);
    }
  }, [db.teams.length]);

  // Auto transition from countdown state to voting state after 10s on admin side
  const currentSession = db.sessions.find(s => s.id === db.currentSessionId) || null;
  // Auto transition countdown and voting durations for ALL active sessions in the database in parallel
  useEffect(() => {
    const interval = setInterval(() => {
      const freshDb = getDB();
      let changed = false;

      freshDb.sessions.forEach(session => {
        if (session.status === 'countdown' && session.countdownStartedAt) {
          const elapsed = Date.now() - session.countdownStartedAt;
          if (elapsed >= 10000) {
            session.status = 'voting';
            session.votingStartedAt = Date.now();
            changed = true;
          }
        } else if (session.status === 'voting' && session.votingStartedAt) {
          const elapsed = (Date.now() - session.votingStartedAt) / 1000;
          if (elapsed >= session.duration) {
            session.status = 'ended';
            changed = true;
          }
        }
      });

      if (changed) {
        saveDB(freshDb);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'diageo@123') {
      setIsAuthenticated(true);
      sessionStorage.setItem('spg_admin_authenticated', 'true');
      setPasswordError('');
    } else {
      setPasswordError('Incorrect admin password.');
    }
  };

  const handleTeamCountChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (teamCountInput < 2) return;
    setTeamCount(teamCountInput);
    // Adjust active team tab
    const freshDb = getDB();
    if (freshDb.teams.length > 0) {
      setSelectedTeamTabId(freshDb.teams[0].id);
    }
  };

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !selectedTeamTabId) return;
    addMember(selectedTeamTabId, newMemberName.trim());
    setNewMemberName('');
  };

  const handleSaveEdit = (memberId: string, currentTeamId: string) => {
    if (!editingName.trim()) return;

    const freshDb = getDB();
    const sourceTeam = freshDb.teams.find(t => t.id === currentTeamId);
    
    if (sourceTeam) {
      const memberIndex = sourceTeam.members.findIndex(m => m.id === memberId);
      if (memberIndex !== -1) {
        if (editingTeamId !== currentTeamId) {
          // Remove from old team
          const [member] = sourceTeam.members.splice(memberIndex, 1);
          member.name = editingName.trim();
          
          // Add to dest team
          const destTeam = freshDb.teams.find(t => t.id === editingTeamId);
          if (destTeam) {
            destTeam.members.push(member);
          }
        } else {
          // Just update name
          sourceTeam.members[memberIndex].name = editingName.trim();
        }
        saveDB(freshDb);
      }
    }
    setEditingMemberId(null);
  };

  const handleUpdateSessionTeamDescription = (sessionId: string, teamId: string, desc: string) => {
    const freshDb = getDB();
    const session = freshDb.sessions.find(s => s.id === sessionId);
    if (session) {
      if (!session.teamDetails) session.teamDetails = {};
      if (!session.teamDetails[teamId]) {
        session.teamDetails[teamId] = { description: '', mediaUrl: '', mediaType: 'image' };
      }
      session.teamDetails[teamId].description = desc;
      saveDB(freshDb);
    }
  };

  const handleUpdateSessionTeamMediaUrl = (sessionId: string, teamId: string, url: string) => {
    const freshDb = getDB();
    const session = freshDb.sessions.find(s => s.id === sessionId);
    if (session) {
      if (!session.teamDetails) session.teamDetails = {};
      if (!session.teamDetails[teamId]) {
        session.teamDetails[teamId] = { description: '', mediaUrl: '', mediaType: 'image' };
      }
      session.teamDetails[teamId].mediaUrl = url;
      saveDB(freshDb);
    }
  };

  const handleUpdateSessionTeamMediaType = (sessionId: string, teamId: string, type: 'image' | 'video') => {
    const freshDb = getDB();
    const session = freshDb.sessions.find(s => s.id === sessionId);
    if (session) {
      if (!session.teamDetails) session.teamDetails = {};
      if (!session.teamDetails[teamId]) {
        session.teamDetails[teamId] = { description: '', mediaUrl: '', mediaType: 'image' };
      }
      session.teamDetails[teamId].mediaType = type;
      saveDB(freshDb);
    }
  };

  const handleSessionTeamMediaUpload = (sessionId: string, teamId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75); // compress jpeg
        
        // Save to DB
        const freshDb = getDB();
        const session = freshDb.sessions.find(s => s.id === sessionId);
        if (session) {
          if (!session.teamDetails) session.teamDetails = {};
          if (!session.teamDetails[teamId]) {
            session.teamDetails[teamId] = { description: '', mediaUrl: '', mediaType: 'image' };
          }
          session.teamDetails[teamId].mediaUrl = dataUrl;
          session.teamDetails[teamId].mediaType = 'image';
          saveDB(freshDb);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitle.trim() || newSessionDuration <= 0 || newSessionMaxVotes <= 0) return;
    const newId = createSession(newSessionTitle.trim(), newSessionDuration, newSessionMaxVotes);
    setNewSessionTitle('');
    setNewSessionMaxVotes(1);
    alert('New voting session created successfully!');
  };



  const handleResetAllData = async () => {
    if (window.confirm('THIS ACTION WILL RESET THE ENTIRE DATABASE TO DEFAULT (Deletes all sessions, restores original teams). Do you want to continue?')) {
      try {
        await resetDatabase();
        localStorage.removeItem('spg_voting_db');
        window.location.reload();
      } catch (err: any) {
        alert('Failed to reset database: ' + err.message);
      }
    }
  };

  const handleResetVotingSessions = async () => {
    if (window.confirm('Are you sure you want to delete all voting sessions? This will keep all teams and members intact.')) {
      try {
        await resetVotingSessions();
        localStorage.removeItem('spg_voting_db');
        window.location.reload();
      } catch (err: any) {
        alert('Failed to reset sessions: ' + err.message);
      }
    }
  };

  // Helper stats
  const totalRegisteredMembers = db.teams.reduce((acc, t) => acc + t.members.length, 0);
  const activeSessionVotesCount = currentSession ? Object.keys(currentSession.votes).length : 0;

  // Render Login Card if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FCFAF6] flex items-center justify-center p-4 text-[#241C15] font-sans">
        <div className="w-full max-w-md bg-white border border-[#BFA15F]/20 rounded-2xl p-8 shadow-[0_15px_40px_rgba(160,120,38,0.06)]">
          <div className="text-center mb-6">
            <div className="bg-gradient-to-r from-[#E0533C] to-[#A07826] text-white text-[12px] font-black py-1 px-3 rounded-md inline-block shadow-sm mb-2">
              ADMIN PANEL
            </div>
            <h2 className="text-xl font-bold tracking-wide uppercase text-[#241C15]">
              Access Required
            </h2>
            <p className="text-xs text-[#241C15]/40 mt-1 font-semibold">
              Enter password to access the control panel
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-[#241C15]/60">Admin Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 border border-[#BFA15F]/30 hover:border-[#A07826] bg-[#F4EFE6]/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-sm font-semibold transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#241C15]/40 hover:text-[#A07826] transition-all p-1"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {passwordError && (
              <p className="text-xs text-[#E0533C] font-semibold text-center">{passwordError}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F] text-white font-bold rounded-xl tracking-wider hover:opacity-95 shadow-md transition-all text-xs uppercase"
            >
              Verify Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFAF6] text-[#241C15] font-sans flex flex-col justify-between pb-12">
      {/* Header */}
      <header className="bg-white border-b border-[#BFA15F]/20 px-6 py-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div className="flex items-center space-x-3">
          <img src="/logo.png" alt="SPG Logo" className="object-contain" style={{ height: '40px', width: 'auto', display: 'block' }} />
          <div className="border-l border-[#BFA15F]/30 pl-3">
            <h1 className="text-sm md:text-base font-black uppercase tracking-wider text-[#241C15]">ALLUMER LE FEU - ADMIN</h1>
            <p className="text-[10px] text-[#241C15]/50 font-bold uppercase mt-0.5 tracking-wider">
              Member Management & Voting Control System
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleResetVotingSessions}
            className="px-4 py-2 border border-[#A07826]/30 text-[#A07826] font-bold text-xs rounded-xl hover:bg-[#A07826]/5 tracking-wide transition-all"
          >
            DELETE ALL SESSIONS
          </button>
          <button
            onClick={handleResetAllData}
            className="px-4 py-2 border border-[#E0533C]/30 text-[#E0533C] font-bold text-xs rounded-xl hover:bg-[#E0533C]/5 tracking-wide transition-all"
          >
            RESET DATABASE TO DEFAULT
          </button>
          <button
            onClick={() => {
              setIsAuthenticated(false);
              sessionStorage.removeItem('spg_admin_authenticated');
            }}
            className="px-4 py-2 border border-[#241C15]/20 hover:bg-[#241C15]/5 font-bold text-xs rounded-xl tracking-wide transition-all"
          >
            LOCK SCREEN
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Middle: Content (Tabs) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex bg-[#F4EFE6] p-1 rounded-xl border border-[#BFA15F]/20">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex-1 py-3 text-sm font-black tracking-widest uppercase rounded-lg transition-all ${
                activeTab === 'sessions' 
                  ? 'bg-white text-[#A07826] shadow-sm' 
                  : 'text-[#241C15]/55 hover:text-[#241C15]'
              }`}
            >
              Voting Management
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-3 text-sm font-black tracking-widest uppercase rounded-lg transition-all ${
                activeTab === 'members' 
                  ? 'bg-white text-[#A07826] shadow-sm' 
                  : 'text-[#241C15]/55 hover:text-[#241C15]'
              }`}
            >
              Team & Member Management
            </button>
          </div>

          {/* TAB 1: SESSIONS MANAGEMENT */}
          {activeTab === 'sessions' && (
            <div className="space-y-6">
              
              {/* Voting Session List */}
              <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="font-extrabold text-base text-[#241C15] uppercase tracking-wide">
                    Voting Sessions List
                  </h3>
                  <p className="text-xs text-[#241C15]/40 font-semibold mt-0.5">
                    Click on a session to configure details or activate controls
                  </p>
                </div>

                <div className="space-y-3">
                  {db.sessions.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-[#BFA15F]/30 rounded-xl bg-[#FCFAF6] text-[#241C15]/40 text-sm font-semibold">
                      No sessions created yet. Use the form below to create one.
                    </div>
                  ) : (
                    db.sessions.map((session) => {
                    const isActive = session.id === db.currentSessionId;
                    const votesCount = Object.keys(session.votes).length;
                    const isExpanded = expandedSessionId === session.id;

                    return (
                      <div
                        key={session.id}
                        className={`rounded-xl border-2 transition-all duration-300 ${
                          isActive
                            ? 'bg-white border-[#A07826] shadow-[0_0_20px_rgba(160,120,38,0.15)] ring-1 ring-[#A07826]/20'
                            : 'bg-[#FCFAF6] border-[#BFA15F]/15 hover:border-[#A07826]/40'
                        }`}
                      >
                        {/* Header Row (clickable to expand) */}
                        <div
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedSessionId(null);
                            } else {
                              setExpandedSessionId(session.id);
                              setEditingSessionTitle(session.title);
                              setEditingSessionDuration(session.duration);
                              setEditingSessionMaxVotes(session.maxVotes || 1);
                            }
                          }}
                          className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer select-none"
                        >
                          <div>
                            <div className="flex items-center space-x-2.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                isActive
                                  ? session.status === 'waiting' ? 'bg-blue-500 animate-pulse' :
                                    session.status === 'countdown' ? 'bg-amber-500 animate-ping' :
                                    session.status === 'voting' ? 'bg-[#E0533C] animate-pulse' : 'bg-gray-400'
                                  : 'bg-gray-300'
                              }`}></span>
                              <h4 className="font-bold text-sm text-[#241C15]">{session.title}</h4>
                            </div>
                            <p className="text-xs text-[#241C15]/40 mt-1 font-semibold">
                              Duration: {formatDuration(session.duration)} • Status:{' '}
                              <span className={`capitalize font-bold ${isActive ? 'text-[#E0533C]' : 'text-[#A07826]/90'}`}>
                                {session.status === 'waiting' && 'Closed'}
                                {session.status === 'countdown' && (() => {
                                  const elapsed = session.countdownStartedAt ? (Date.now() - session.countdownStartedAt) / 1000 : 0;
                                  const rem = Math.max(0, 10 - elapsed);
                                  return `Countdown (${formatDuration(rem)} remaining)`;
                                })()}
                                {session.status === 'voting' && (() => {
                                  const elapsed = session.votingStartedAt ? (Date.now() - session.votingStartedAt) / 1000 : 0;
                                  const rem = Math.max(0, session.duration - elapsed);
                                  return `Voting (${formatDuration(rem)} remaining)`;
                                })()}
                                {session.status === 'ended' && 'Ended'}
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center space-x-3 self-end sm:self-center">
                            <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs bg-[#F4EFE6] text-[#A07826] font-bold px-2.5 py-1 rounded-lg border border-[#BFA15F]/10">
                                {votesCount} voters voted
                              </span>

                              {isActive ? (
                                <div className="flex items-center space-x-2">
                                  {session.status === 'waiting' && (
                                    <button
                                      onClick={() => {
                                        triggerCountdown(session.id);
                                      }}
                                      className="px-3 py-1 bg-gradient-to-r from-[#E0533C] to-[#A07826] text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm hover:shadow transition-all flex items-center space-x-1"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                      </svg>
                                      <span>Start</span>
                                    </button>
                                  )}

                                  {session.status === 'countdown' && (
                                    <button
                                      onClick={() => {
                                        startVoting(session.id);
                                      }}
                                      className="px-3 py-1 bg-[#A07826] text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-[#765410] transition-all"
                                    >
                                      Vote Now
                                    </button>
                                  )}

                                  {session.status === 'voting' && (
                                    <button
                                      onClick={() => {
                                        forceStopSession(session.id);
                                      }}
                                      className="px-3 py-1 bg-[#E0533C] text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-red-700 transition-all flex items-center space-x-1"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z"></path>
                                      </svg>
                                      <span>Stop</span>
                                    </button>
                                  )}

                                  {session.status === 'ended' && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to reset the votes for session "${session.title}"?`)) {
                                          const freshDb = getDB();
                                          const s = freshDb.sessions.find(item => item.id === session.id);
                                          if (s) {
                                            s.votes = {};
                                            s.status = 'waiting';
                                            s.countdownStartedAt = null;
                                            s.votingStartedAt = null;
                                            if (freshDb.currentSessionId === session.id) {
                                              freshDb.currentSessionId = null;
                                            }
                                            saveDB(freshDb);
                                          }
                                        }
                                      }}
                                      className="px-3 py-1 border border-[#BFA15F]/50 text-[#A07826] hover:bg-[#F4EFE6]/40 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to set "${session.title}" as the active session? The voting portal will switch to this session.`)) {
                                      switchSession(session.id);
                                    }
                                  }}
                                  className="px-3 py-1 bg-[#A07826] hover:bg-[#765410] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all"
                                >
                                  Activate
                                </button>
                              )}
                            </div>

                            {/* Chevron indicator */}
                            <svg 
                              className={`w-4 h-4 text-[#A07826] transition-transform duration-200 ${isExpanded ? 'transform rotate-180' : ''}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24" 
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                            </svg>
                          </div>
                        </div>

                        {/* Real-time Voter Progress Bar for Active Session */}
                        {isActive && (
                          <div className="px-4 pb-4">
                            <div className="bg-[#F4EFE6]/30 border border-[#BFA15F]/15 rounded-xl p-3.5 space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#241C15]/50 uppercase tracking-wider">
                                <span>Voters Progress Bar</span>
                                <span className="text-[#A07826] font-extrabold">
                                  {votesCount} / {totalRegisteredMembers} members voted
                                </span>
                              </div>
                              <div className="w-full h-2 bg-[#F4EFE6]/70 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-[#E0533C] to-[#A07826] transition-all duration-300"
                                  style={{ width: `${(votesCount / Math.max(1, totalRegisteredMembers)) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Expanded details panel */}
                        {isExpanded && (
                          <div 
                            className="border-t border-[#F4EFE6] p-4 bg-[#FCFAF6]/50 rounded-b-xl space-y-5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* 1. Edit Basic Info form */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                              <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-[#241C15]/50">Voting Session Title</label>
                                <input
                                  type="text"
                                  value={editingSessionTitle}
                                  onChange={(e) => setEditingSessionTitle(e.target.value)}
                                  className="w-full px-3 py-2 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-semibold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-[#241C15]/50">Duration (Seconds)</label>
                                <input
                                  type="number"
                                  value={editingSessionDuration}
                                  onChange={(e) => setEditingSessionDuration(parseInt(e.target.value) || 0)}
                                  className="w-full px-3 py-2 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-[#241C15]/50">Max Votes</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={editingSessionMaxVotes}
                                  onChange={(e) => setEditingSessionMaxVotes(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-full px-3 py-2 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-bold"
                                />
                              </div>
                            </div>

                            {/* State Controls for voting */}
                            <div className="bg-[#F4EFE6]/30 border border-[#BFA15F]/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                              <div className="space-y-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">Status Controls</span>
                                <div className="flex items-center space-x-2">
                                  <span className={`w-2.5 h-2.5 rounded-full ${
                                    session.status === 'waiting' ? 'bg-blue-500' :
                                    session.status === 'countdown' ? 'bg-amber-500 animate-pulse' :
                                    session.status === 'voting' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                                  }`}></span>
                                  <span className="text-xs font-bold text-[#241C15]">
                                    {session.status === 'waiting' && 'Gate Closed'}
                                    {session.status === 'countdown' && (() => {
                                      const elapsed = session.countdownStartedAt ? (Date.now() - session.countdownStartedAt) / 1000 : 0;
                                      const rem = Math.max(0, 10 - elapsed);
                                      return `10s Countdown (${formatDuration(rem)} left)`;
                                    })()}
                                    {session.status === 'voting' && (() => {
                                      const elapsed = session.votingStartedAt ? (Date.now() - session.votingStartedAt) / 1000 : 0;
                                      const rem = Math.max(0, session.duration - elapsed);
                                      return `Voting Open (${formatDuration(rem)} left)`;
                                    })()}
                                    {session.status === 'ended' && 'Voting Ended'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {session.status === 'waiting' && (
                                  <button
                                    onClick={() => {
                                      switchSession(session.id);
                                      triggerCountdown(session.id);
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-[#E0533C] to-[#A07826] text-white text-xs font-extrabold uppercase tracking-wider rounded-lg shadow-sm hover:shadow transition-all flex items-center space-x-1.5"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                    </svg>
                                    <span>Start</span>
                                  </button>
                                )}

                                {session.status === 'countdown' && (
                                  <button
                                    onClick={() => {
                                      switchSession(session.id);
                                      startVoting(session.id);
                                    }}
                                    className="px-4 py-2 bg-[#A07826] text-white text-xs font-extrabold uppercase tracking-wider rounded-lg hover:bg-[#765410] transition-all"
                                  >
                                    Skip Countdown & Vote Now
                                  </button>
                                )}

                                {session.status === 'voting' && (
                                  <button
                                    onClick={() => {
                                      forceStopSession(session.id);
                                    }}
                                    className="px-4 py-2 bg-[#E0533C] text-white text-xs font-extrabold uppercase tracking-wider rounded-lg hover:bg-red-700 transition-all flex items-center space-x-1.5"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z"></path>
                                    </svg>
                                    <span>Stop Voting</span>
                                  </button>
                                )}

                                {session.status === 'ended' && (
                                  <span className="text-xs italic text-[#241C15]/40 font-semibold flex items-center">
                                    Results Locked
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => {
                                  if (!editingSessionTitle.trim() || editingSessionDuration <= 0 || editingSessionMaxVotes <= 0) {
                                    alert('Please fill in a valid title, duration, and max votes.');
                                    return;
                                  }
                                  updateSessionInfo(session.id, editingSessionTitle.trim(), editingSessionDuration, editingSessionMaxVotes);
                                  alert('Session updated successfully!');
                                }}
                                className="px-4 py-2 bg-[#A07826] hover:bg-[#765410] text-white text-xs font-bold uppercase rounded-lg transition-all"
                              >
                                Save Info
                              </button>

                              <button
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to reset the votes for session "${session.title}"?`)) {
                                    const freshDb = getDB();
                                    const s = freshDb.sessions.find(item => item.id === session.id);
                                    if (s) {
                                      s.votes = {};
                                      s.status = 'waiting';
                                      s.countdownStartedAt = null;
                                      s.votingStartedAt = null;
                                      if (freshDb.currentSessionId === session.id) {
                                        freshDb.currentSessionId = null;
                                      }
                                      saveDB(freshDb);
                                      alert('Votes reset successfully!');
                                    }
                                  }
                                }}
                                className="px-4 py-2 border border-[#BFA15F]/50 text-[#A07826] hover:bg-[#F4EFE6]/40 text-xs font-bold uppercase rounded-lg transition-all"
                              >
                                Reset Votes
                              </button>

                              <button
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to DELETE session "${session.title}"? This action cannot be undone.`)) {
                                    deleteSession(session.id);
                                    setExpandedSessionId(null);
                                    alert('Session deleted successfully!');
                                  }
                                }}
                                className="px-4 py-2 bg-[#E0533C] hover:bg-red-700 text-white text-xs font-bold uppercase rounded-lg transition-all ml-auto"
                              >
                                Delete Session
                              </button>
                            </div>

                            {/* 2. Team configuration for this session */}
                            <div className="border-t border-[#F4EFE6] pt-4 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                  <h4 className="font-extrabold text-xs text-[#241C15] uppercase tracking-wider">
                                    Configure Team Performances for this Session
                                  </h4>
                                  <p className="text-[9px] text-[#241C15]/40 font-semibold">
                                    Configure distinct media and description for this voting session
                                  </p>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0">
                                  <label className="text-[10px] font-bold text-[#241C15]/50 uppercase">Select Team:</label>
                                  <select
                                    value={selectedConfigTeamId}
                                    onChange={(e) => setSelectedConfigTeamId(e.target.value)}
                                    className="bg-[#F4EFE6] border border-[#BFA15F]/30 rounded-lg px-2.5 py-1 text-xs font-bold text-[#241C15] focus:outline-none"
                                  >
                                    {db.teams.map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Form edit for targetTeam in this session */}
                              {selectedConfigTeamId && (() => {
                                const targetDetails = session.teamDetails?.[selectedConfigTeamId] || {
                                  description: '',
                                  mediaUrl: '',
                                  mediaType: 'image'
                                };
                                const targetTeam = db.teams.find(t => t.id === selectedConfigTeamId);

                                return (
                                  <div className="bg-[#FCFAF6] border border-[#BFA15F]/15 rounded-xl p-4 space-y-4 shadow-inner">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-1.5 col-span-1 md:col-span-2">
                                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">
                                          Performance description for {targetTeam?.name} (Required)
                                        </label>
                                        <textarea
                                          rows={2}
                                          value={targetDetails.description}
                                          onChange={(e) => handleUpdateSessionTeamDescription(session.id, selectedConfigTeamId, e.target.value)}
                                          placeholder="Enter the performance/contest description for this team..."
                                          className="w-full px-3 py-2 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-semibold leading-relaxed"
                                        />
                                      </div>

                                      <div className="space-y-1.5">
                                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">Media Type</label>
                                        <select
                                          value={targetDetails.mediaType || 'image'}
                                          onChange={(e) => handleUpdateSessionTeamMediaType(session.id, selectedConfigTeamId, e.target.value as 'image' | 'video')}
                                          className="w-full px-3 py-2 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-bold"
                                        >
                                          <option value="image">Image</option>
                                          <option value="video">Video (YouTube Link)</option>
                                        </select>
                                      </div>

                                      {targetDetails.mediaType === 'video' ? (
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">YouTube Video Link</label>
                                          <input
                                            type="text"
                                            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                                            value={targetDetails.mediaUrl || ''}
                                            onChange={(e) => handleUpdateSessionTeamMediaUrl(session.id, selectedConfigTeamId, e.target.value)}
                                            className="w-full px-3 py-2 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-semibold"
                                          />
                                        </div>
                                      ) : (
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">Upload Image</label>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleSessionTeamMediaUpload(session.id, selectedConfigTeamId, e)}
                                            className="w-full px-3 py-1.5 border border-[#BFA15F]/30 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A07826] text-xs font-semibold file:mr-3 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[9px] file:font-bold file:uppercase file:bg-[#A07826]/10 file:text-[#A07826]"
                                          />
                                        </div>
                                      )}

                                      {/* Preview area */}
                                      {targetDetails.mediaUrl && (
                                        <div className="col-span-1 md:col-span-2 space-y-1">
                                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">Media Preview</label>
                                          <div className="aspect-video max-w-xs rounded-lg overflow-hidden border border-[#BFA15F]/20 shadow-sm relative bg-[#F4EFE6]">
                                            {targetDetails.mediaType === 'video' ? (() => {
                                              const embedUrl = getYouTubeEmbedUrl(targetDetails.mediaUrl);
                                              return embedUrl ? (
                                                <iframe
                                                  src={embedUrl}
                                                  title="YouTube Video Preview"
                                                  frameBorder="0"
                                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                  allowFullScreen
                                                  className="w-full h-full"
                                                />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center p-4 text-center">
                                                  <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Invalid YouTube URL</p>
                                                </div>
                                              );
                                            })() : (
                                              <img src={targetDetails.mediaUrl} alt={targetTeam?.name} className="w-full h-full object-cover" />
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              </div>

              {/* Create New Session Form */}
              <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm">
                <h3 className="font-extrabold text-base text-[#241C15] uppercase tracking-wide mb-4">
                  Create New Session
                </h3>
                <form onSubmit={handleCreateSessionSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#241C15]/50">Voting Title</label>
                    <input
                      type="text"
                      placeholder="e.g., Best Costume Voting"
                      value={newSessionTitle}
                      onChange={(e) => setNewSessionTitle(e.target.value)}
                      className="w-full px-4 py-3 border border-[#BFA15F]/30 bg-[#F4EFE6]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#241C15]/50">Duration (Seconds)</label>
                    <input
                      type="number"
                      value={newSessionDuration}
                      onChange={(e) => setNewSessionDuration(parseInt(e.target.value) || 0)}
                      className="w-full px-4 py-3 border border-[#BFA15F]/30 bg-[#F4EFE6]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#241C15]/50">Max Votes</label>
                    <input
                      type="number"
                      min="1"
                      value={newSessionMaxVotes}
                      onChange={(e) => setNewSessionMaxVotes(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 border border-[#BFA15F]/30 bg-[#F4EFE6]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-xs font-semibold"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <button
                      type="submit"
                      disabled={!newSessionTitle.trim()}
                      className="w-full py-3 bg-[#A07826] hover:bg-[#765410] disabled:opacity-50 text-white font-bold rounded-xl tracking-wider text-xs uppercase transition-all"
                    >
                      Create Session
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

          {/* TAB 2: TEAMS & MEMBERS MANAGEMENT */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              
              {/* Configure Team count */}
              <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm">
                <h3 className="font-extrabold text-base text-[#241C15] uppercase tracking-wide mb-2">
                  Set Team Count
                </h3>
                <p className="text-xs text-[#241C15]/40 font-semibold mb-4">
                  Change the number of teams. Adding will create new teams, reducing will remove the last teams.
                </p>
                <form onSubmit={handleTeamCountChange} className="flex items-center space-x-3 max-w-sm">
                  <input
                    type="number"
                    min="2"
                    max="15"
                    value={teamCountInput}
                    onChange={(e) => setTeamCountInput(parseInt(e.target.value) || 0)}
                    className="w-24 px-4 py-3 border border-[#BFA15F]/30 bg-[#F4EFE6]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-center text-sm font-bold"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 bg-[#A07826] hover:bg-[#765410] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    Update Teams
                  </button>
                </form>
              </div>

              {/* Tabbed Card Members Management */}
              <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="font-extrabold text-base text-[#241C15] uppercase tracking-wide">
                    Team Members List
                  </h3>
                  <p className="text-xs text-[#241C15]/40 font-semibold mt-0.5">
                    Select a team tab to add/remove members and edit team names
                  </p>
                </div>

                {/* Horizontal Team Tabs */}
                <div className="flex flex-wrap gap-2 pb-3 border-b border-[#F4EFE6]">
                  {db.teams.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTeamTabId(t.id)}
                      className={`px-4 py-2 text-xs font-bold uppercase rounded-lg border transition-all ${
                        selectedTeamTabId === t.id
                          ? 'bg-[#A07826]/10 border-[#A07826] text-[#A07826]'
                          : 'bg-[#FCFAF6] border-[#BFA15F]/15 text-[#241C15]/60 hover:border-[#A07826]/40'
                      }`}
                    >
                      {t.name} ({t.members.length})
                    </button>
                  ))}
                </div>

                {/* Team Edit Content */}
                {selectedTeamTabId && (() => {
                  const team = db.teams.find(t => t.id === selectedTeamTabId);
                  if (!team) return null;

                  return (
                    <div className="space-y-6 pt-2">
                      {/* Edit Team Name */}
                      <div className="flex items-end gap-3 max-w-md">
                        <div className="flex-grow space-y-1">
                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">Team Name</label>
                          <input
                            type="text"
                            value={team.name}
                            onChange={(e) => updateTeamName(team.id, e.target.value)}
                            className="w-full px-4 py-2 border border-[#BFA15F]/30 bg-[#F4EFE6]/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-xs font-bold"
                          />
                        </div>
                      </div>

                      {/* Add new member form */}
                      <form onSubmit={handleAddMemberSubmit} className="flex items-center space-x-3 max-w-md pt-2">
                        <div className="flex-grow space-y-1">
                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#241C15]/50">Add New Member</label>
                          <input
                            type="text"
                            placeholder="Enter full name..."
                            value={newMemberName}
                            onChange={(e) => setNewMemberName(e.target.value)}
                            className="w-full px-4 py-2 border border-[#BFA15F]/30 bg-[#F4EFE6]/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 text-xs font-semibold"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!newMemberName.trim()}
                          className="px-5 py-2.5 bg-[#A07826] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all self-end"
                        >
                          Add
                        </button>
                      </form>

                      {/* Members List */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#241C15]/65">
                          Current Members ({team.members.length}):
                        </h4>
                        
                        {team.members.length === 0 ? (
                          <p className="text-xs italic text-[#241C15]/30 py-3">No members in this team.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {team.members.map((member) => {
                              const isEditing = editingMemberId === member.id;
                              
                              if (isEditing) {
                                return (
                                  <div
                                    key={member.id}
                                    className="bg-[#FCFAF6] border border-[#BFA15F]/20 p-2.5 rounded-lg flex flex-col space-y-2 text-xs"
                                  >
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        placeholder="Member Name"
                                        className="flex-grow px-2 py-1.5 border border-[#BFA15F]/30 bg-white rounded-md text-xs font-semibold focus:outline-none"
                                      />
                                      <select
                                        value={editingTeamId}
                                        onChange={(e) => setEditingTeamId(e.target.value)}
                                        className="w-24 px-2 py-1.5 border border-[#BFA15F]/30 bg-white rounded-md text-xs font-semibold focus:outline-none"
                                      >
                                        {db.teams.map(t => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex justify-end space-x-2 pt-1 border-t border-[#F4EFE6]">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveEdit(member.id, team.id)}
                                        className="text-green-600 hover:text-green-700 font-bold px-2 py-0.5"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingMemberId(null)}
                                        className="text-gray-500 hover:text-gray-600 font-semibold px-2 py-0.5"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={member.id}
                                  className="bg-[#FCFAF6] border border-[#BFA15F]/10 px-3 py-2.5 rounded-lg flex items-center justify-between text-xs"
                                >
                                  <span className="font-bold text-[#241C15]/80">{member.name}</span>
                                  <div className="flex items-center space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMemberId(member.id);
                                        setEditingName(member.name);
                                        setEditingTeamId(team.id);
                                      }}
                                      className="text-[#A07826] hover:text-[#765410] font-bold"
                                    >
                                      Edit
                                    </button>
                                    <span className="text-[#BFA15F]/30">|</span>
                                    <button
                                      type="button"
                                      onClick={() => deleteMember(team.id, member.id)}
                                      className="text-[#E0533C]/80 hover:text-[#E0533C] font-bold"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>


            </div>
          )}
        </div>

        {/* Right side: Realtime Stats & Results Preview */}
        <div className="space-y-6">
          {/* Quick Info statistics panel */}
          <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm space-y-4">
            <h3 className="font-extrabold text-sm text-[#241C15]/80 uppercase tracking-wide border-b border-[#F4EFE6] pb-3">
              Quick Stats
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#FCFAF6] border border-[#BFA15F]/10 rounded-xl p-4 text-center">
                <span className="text-2xl font-black text-[#A07826]">{db.teams.length}</span>
                <p className="text-[10px] text-[#241C15]/50 uppercase tracking-wider font-bold mt-1">Total Teams</p>
              </div>
              <div className="bg-[#FCFAF6] border border-[#BFA15F]/10 rounded-xl p-4 text-center">
                <span className="text-2xl font-black text-[#A07826]">{totalRegisteredMembers}</span>
                <p className="text-[10px] text-[#241C15]/50 uppercase tracking-wider font-bold mt-1">Total Members</p>
              </div>
            </div>
          </div>

          {/* Voter Turnout Tracking (Admin Tool) */}
          <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-extrabold text-sm text-[#241C15]/80 uppercase tracking-wide">
                Voter Turnout Tracking
              </h3>
              <p className="text-[10px] text-[#241C15]/40 font-semibold mt-0.5">
                Check which members of each team have cast their votes
              </p>
            </div>

            {currentSession ? (
              <div className="space-y-4 pt-2">
                {db.teams.map((team) => {
                  const votedMembers = team.members.filter(m => !!currentSession.votes[m.id]);
                  const votedCount = votedMembers.length;
                  const totalCount = team.members.length;
                  const pct = (votedCount / Math.max(1, totalCount)) * 100;

                  return (
                    <div key={team.id} className="space-y-2 border-b border-[#F4EFE6] pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-[#241C15]">{team.name}</span>
                        <span className="font-bold text-[#A07826]">{votedCount}/{totalCount} Voted</span>
                      </div>
                      <div className="w-full h-2 bg-[#F4EFE6] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                      
                      {/* Compact Member Turnout list */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {team.members.map(member => {
                          const hasVoted = !!currentSession.votes[member.id];
                          return (
                            <span 
                              key={member.id} 
                              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-all border ${
                                hasVoted 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' 
                                  : 'bg-gray-50 border-gray-100 text-gray-400'
                              }`}
                              title={hasVoted ? `${member.name} has voted` : `${member.name} has not voted`}
                            >
                              {hasVoted ? '✓ ' : '○ '}{member.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs italic text-[#241C15]/30 text-center py-4">No active session.</p>
            )}
          </div>

          {/* Realtime Live Leaderboard (Admin Preview) */}
          <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-extrabold text-sm text-[#241C15]/80 uppercase tracking-wide">
                Realtime Live Results
              </h3>
              <p className="text-[10px] text-[#241C15]/40 font-semibold mt-0.5">
                Watch live vote counts change in real-time
              </p>
            </div>

            {currentSession ? (() => {
              // Calculate live votes
              const resultsMap: Record<string, number> = {};
              db.teams.forEach(t => { resultsMap[t.id] = 0; });
              Object.values(currentSession.votes).forEach(votes => {
                votes.forEach(id => {
                  if (resultsMap[id] !== undefined) resultsMap[id]++;
                });
              });
              const results = db.teams.map(t => ({ ...t, votes: resultsMap[t.id] }))
                .sort((a, b) => b.votes - a.votes);

              return (
                <div className="space-y-4 pt-2">
                  {results.map((team, index) => {
                    const totalVotes = results.reduce((acc, curr) => acc + curr.votes, 0);
                    const pct = (team.votes / Math.max(1, totalVotes)) * 100;
                    return (
                      <div key={team.id} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-[#241C15]">{index + 1}. {team.name}</span>
                          <span className="font-extrabold text-[#A07826]">
                            {team.votes} {team.votes === 1 ? 'Vote' : 'Votes'}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-[#F4EFE6] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#E0533C]/70 to-[#A07826] rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <p className="text-xs italic text-[#241C15]/30 text-center py-4">No active session.</p>
            )}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-[#241C15]/30 font-bold uppercase tracking-widest mt-8">
        Voting Management System SPG Allumer le feu 2026
      </footer>
    </div>
  );
}
