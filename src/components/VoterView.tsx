import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDB, subscribeToDB, castVote, getYouTubeEmbedUrl, Team, VotingSession, formatDuration } from '../lib/database';

interface VoterViewProps {
  user: { id: string; name: string; teamId: string; teamName: string };
  onLogout: () => void;
}

export default function VoterView({ user, onLogout }: VoterViewProps) {
  const [db, setDb] = useState(getDB());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(10);
  const [votingRemaining, setVotingRemaining] = useState(60);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [votedInCurrentSession, setVotedInCurrentSession] = useState(false);
  const [animateResults, setAnimateResults] = useState(false);

  // References for intervals
  const countdownIntervalRef = useRef<any>(null);
  const votingIntervalRef = useRef<any>(null);

  // Subscribe to DB updates
  useEffect(() => {
    const unsub = subscribeToDB((freshDb) => {
      setDb(freshDb);

      // Auto logout if the user no longer exists in the fresh DB (e.g. database reset)
      if (user && freshDb.teams.length > 0) {
        const allMembers = freshDb.teams.flatMap(t => t.members);
        const memberExists = allMembers.some(m => m.id === user.id);
        if (!memberExists) {
          onLogout();
        }
      }
    });
    return () => unsub();
  }, [user, onLogout]);

  // Sync selectedSessionId with db.currentSessionId when it changes,
  // or default to the first session if none is selected yet.
  useEffect(() => {
    if (db.currentSessionId) {
      setSelectedSessionId(db.currentSessionId);
    } else if (db.sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(db.sessions[0].id);
    }
  }, [db.currentSessionId]);

  const visibleSessions = db.sessions.filter(s => 
    s.id === db.currentSessionId || 
    s.status === 'countdown' || 
    s.status === 'voting' || 
    s.status === 'ended'
  );

  const currentSession = 
    visibleSessions.find(s => s.id === selectedSessionId) || 
    visibleSessions.find(s => s.id === db.currentSessionId) || 
    (visibleSessions.length > 0 ? visibleSessions[0] : null);


  // Track if user has voted in the current session
  useEffect(() => {
    if (currentSession && user) {
      const userVotes = currentSession.votes[user.id];
      setVotedInCurrentSession(!!userVotes);
      if (userVotes) {
        setSelectedTeams(userVotes);
      } else {
        setSelectedTeams([]);
      }
    } else {
      setVotedInCurrentSession(false);
      setSelectedTeams([]);
    }
  }, [currentSession, user]);

  // Handle countdown timer logic
  useEffect(() => {
    if (currentSession && currentSession.status === 'countdown' && currentSession.countdownStartedAt) {
      const tick = () => {
        const elapsed = (Date.now() - currentSession.countdownStartedAt!) / 1000;
        const rem = Math.max(0, 10 - elapsed);
        setCountdownSeconds(Math.ceil(rem));
      };

      tick();
      countdownIntervalRef.current = setInterval(tick, 200);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [currentSession]);

  // Handle voting timer logic
  useEffect(() => {
    if (currentSession && (currentSession.status === 'voting' || currentSession.status === 'countdown')) {
      const tick = () => {
        let startTime = currentSession.votingStartedAt;
        if (!startTime && currentSession.countdownStartedAt) {
          startTime = currentSession.countdownStartedAt + 10000; // default start after 10s countdown
        }

        if (startTime) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rem = Math.max(0, currentSession.duration - elapsed);
          setVotingRemaining(rem);
        } else {
          setVotingRemaining(currentSession.duration);
        }
      };

      tick();
      votingIntervalRef.current = setInterval(tick, 200);
    } else {
      if (votingIntervalRef.current) {
        clearInterval(votingIntervalRef.current);
      }
    }

    return () => {
      if (votingIntervalRef.current) {
        clearInterval(votingIntervalRef.current);
      }
    };
  }, [currentSession]);

  // Determine whether results reveal animation should play (only once per session)
  useEffect(() => {
    if (currentSession && currentSession.status === 'ended') {
      const sessionKey = `reveal_animated_${currentSession.id}`;
      const hasAnimated = sessionStorage.getItem(sessionKey);
      if (!hasAnimated) {
        setAnimateResults(true);
        sessionStorage.setItem(sessionKey, 'true');
      } else {
        setAnimateResults(false);
      }
    } else {
      setAnimateResults(false);
    }
  }, [currentSession]);

  if (!currentSession) {
    return (
      <div className="min-h-screen bg-[#FCFAF6] flex flex-col justify-between font-sans text-[#241C15]">
        {/* Header Panel */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#BFA15F]/20 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <img src="/logo.png" alt="SPG Logo" className="object-contain" style={{ height: '36px', width: 'auto', display: 'block' }} />
            <div className="border-l border-[#BFA15F]/30 pl-3">
              <h1 className="text-[10px] uppercase tracking-widest text-[#241C15]/50 font-bold leading-none">Welcome</h1>
              <p className="text-xs font-bold text-[#241C15] mt-1.5 leading-none">{user.name} ({user.teamName})</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 border border-[#E0533C]/20 hover:bg-[#E0533C]/5 text-[#E0533C] text-xs font-bold rounded-xl tracking-wider transition-all"
          >
            LOGOUT
          </button>
        </header>

        {/* Main Welcome Message */}
        <main className="flex-grow flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto w-full text-center space-y-6">
          <div className="bg-white rounded-3xl border border-[#BFA15F]/20 p-8 sm:p-12 shadow-[0_20px_50px_rgba(160,120,38,0.06)] space-y-6 w-full">
            <div className="inline-flex items-center justify-center p-4 rounded-full bg-[#F4EFE6] text-[#A07826]">
              <svg className="w-8 h-8 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
              </svg>
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-black tracking-wide text-[#241C15] uppercase">
              Welcome, {user.name}!
            </h2>
            <p className="text-sm sm:text-base text-[#241C15]/60 font-semibold leading-relaxed">
              We are delighted to have you at the SPG Year End Event 2026. 
              Please hold on while the organizer prepares the voting sessions!
            </p>
            <div className="bg-[#F4EFE6]/50 rounded-2xl p-4 border border-[#BFA15F]/10 text-xs font-bold text-[#A07826] tracking-wide uppercase">
              ✨ Ready for "Allumer le feu"
            </div>
          </div>
        </main>

        {/* Footer Branding */}
        <footer className="py-6 text-center text-[10px] text-[#241C15]/30 font-semibold uppercase tracking-widest border-t border-[#BFA15F]/10 bg-white/50">
          Allumer le feu • Hoi An 2026
        </footer>
      </div>
    );
  }

  // Calculate voting results
  const getResults = () => {
    const resultsMap: Record<string, number> = {};
    // Initialize teams
    db.teams.forEach(t => {
      resultsMap[t.id] = 0;
    });
    // Add vote tallies
    Object.values(currentSession.votes).forEach(votes => {
      votes.forEach(teamId => {
        if (resultsMap[teamId] !== undefined) {
          resultsMap[teamId]++;
        }
      });
    });

    return db.teams.map(team => ({
      ...team,
      votes: resultsMap[team.id] || 0
    })).sort((a, b) => b.votes - a.votes);
  };

  // Toggle selection
  const handleSelectTeam = (teamId: string) => {
    if (votedInCurrentSession || votingRemaining <= 0) return;
    const limit = currentSession?.maxVotes || 1;
    setSelectedTeams(prev => {
      if (prev.includes(teamId)) {
        return prev.filter(id => id !== teamId);
      }
      if (prev.length >= limit) {
        // max votes limit reached
        return prev;
      }
      return [...prev, teamId];
    });
  };

  const handleVoteSubmit = () => {
    if (selectedTeams.length === 0 || votedInCurrentSession || votingRemaining <= 0) return;
    castVote(currentSession.id, user.id, selectedTeams);
  };

  const elapsedSeconds = currentSession.countdownStartedAt ? (Date.now() - currentSession.countdownStartedAt) / 1000 : 0;
  const isCountdownActive = currentSession.status === 'countdown' && elapsedSeconds < 10;
  const isVotingActive = currentSession.status === 'voting' || (currentSession.status === 'countdown' && elapsedSeconds >= 10);
  const isWaiting = currentSession.status === 'waiting';
  const isEnded = currentSession.status === 'ended';

  // Stagger animation configuration
  const containerVariants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80 } }
  };

  return (
    <div className="min-h-screen bg-[#FCFAF6] flex flex-col justify-between font-sans text-[#241C15]">
      {/* Sticky Header Panel */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#BFA15F]/20 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <img src="/logo.png" alt="SPG Logo" className="object-contain" style={{ height: '36px', width: 'auto', display: 'block' }} />
          <div className="border-l border-[#BFA15F]/30 pl-3">
            <h1 className="text-[10px] uppercase tracking-widest text-[#241C15]/50 font-bold leading-none">Welcome</h1>
            <p className="text-xs font-bold text-[#241C15] mt-1.5 leading-none">{user.name} ({user.teamName})</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 border border-[#E0533C]/20 hover:bg-[#E0533C]/5 text-[#E0533C] text-xs font-bold rounded-xl tracking-wider transition-all"
        >
          LOGOUT
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col justify-start px-4 py-8 max-w-2xl sm:max-w-3xl mx-auto w-full">
        {/* Horizontal scrollable tab switcher */}
        {visibleSessions.length > 1 && (
          <div className="flex overflow-x-auto no-scrollbar py-2 -mx-4 px-4 space-x-2 border-b border-[#BFA15F]/15 mb-6 sticky top-[57px] z-20 bg-[#FCFAF6] scroll-smooth">
            {visibleSessions.map((session) => {
              const isSelected = currentSession?.id === session.id;
              
              // Status indicators
              let statusDot = 'bg-gray-300';
              let statusText = 'Closed';
              let statusColor = 'text-gray-500 bg-gray-100 border-gray-200';
              
              if (session.status === 'voting') {
                statusDot = 'bg-[#E0533C] animate-pulse';
                statusText = 'Voting';
                statusColor = 'text-[#E0533C] bg-[#E0533C]/10 border-[#E0533C]/20';
              } else if (session.status === 'countdown') {
                statusDot = 'bg-amber-500 animate-ping';
                statusText = 'Countdown';
                statusColor = 'text-amber-600 bg-amber-50 border-amber-200';
              } else if (session.status === 'ended') {
                statusDot = 'bg-[#B28E43]';
                statusText = 'Ended';
                statusColor = 'text-[#B28E43] bg-[#F4EFE6] border-[#BFA15F]/20';
              }

              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center space-x-2 shadow-sm ${
                    isSelected
                      ? 'bg-white border-[#A07826] text-[#A07826] ring-1 ring-[#A07826]/10'
                      : 'bg-white/70 border-[#BFA15F]/20 text-[#241C15]/60 hover:border-[#A07826]/40'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                  <span>{session.title}</span>
                  <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md border ${statusColor}`}>
                    {statusText}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STATE 1: WAITING STATE */}
          {isWaiting && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 sm:space-y-8 text-center"
            >
              <img 
                src="/banner.jpg" 
                alt="SPG Year End Trip 2026" 
                className="w-full h-auto rounded-2xl border border-[#BFA15F]/20 shadow-sm"
              />
              <div className="bg-white rounded-3xl border border-[#BFA15F]/20 p-8 sm:p-12 shadow-[0_20px_50px_rgba(160,120,38,0.06)] space-y-6">
                <div className="inline-flex items-center justify-center p-4 rounded-full bg-[#F4EFE6] text-[#A07826]">
                  <svg className="w-8 h-8 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <h3 className="text-xl sm:text-2xl font-display font-black tracking-wide text-[#241C15]">VOTING GATE IS CLOSED</h3>
                <p className="text-sm sm:text-base text-[#241C15]/60 font-semibold leading-relaxed">
                  Session: <span className="text-[#A07826] font-bold">"{currentSession.title}"</span>
                </p>
                <div className="bg-[#F4EFE6]/50 rounded-2xl p-6 border border-[#BFA15F]/10">
                  <p className="text-xs sm:text-sm font-bold text-[#E0533C]/90 tracking-wide uppercase">
                    🔔 Notice from Organizer:
                  </p>
                  <p className="text-sm sm:text-base font-semibold text-[#241C15]/80 mt-2">
                    The organizer has not opened the voting gate for this session yet. Please wait a moment!
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE 2: 10S COUNTDOWN */}
          {isCountdownActive && (
            <motion.div
              key="countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <p className="text-xs sm:text-sm uppercase font-extrabold tracking-widest text-[#A07826] mb-3">
                PREPARING FOR VOTING
              </p>
              <h2 className="text-lg sm:text-2xl font-bold text-[#241C15]/80 mb-8 max-w-lg px-4 leading-normal">
                "{currentSession.title}"
              </h2>
              <div className="relative flex items-center justify-center w-48 h-48 sm:w-64 sm:h-64">
                {/* Circular Pulsing Glow */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#E0533C]/10 to-[#A07826]/10 animate-ping"></div>
                {/* Border Ring */}
                <div className="absolute inset-0 rounded-full border-4 border-[#F4EFE6]"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-[#E0533C] border-r-[#A07826] animate-spin"></div>
                {/* Countdown Digit */}
                <motion.span
                  key={countdownSeconds}
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1.1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                  className="text-7xl sm:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-[#E0533C] to-[#A07826]"
                >
                  {countdownSeconds}
                </motion.span>
              </div>
              <p className="text-sm sm:text-base text-[#241C15]/50 font-bold uppercase tracking-widest mt-8 animate-pulse">
                Voting gate opening soon...
              </p>
            </motion.div>
          )}

          {/* STATE 3: VOTING SCREEN */}
          {isVotingActive && !isEnded && (
            <motion.div
              key="voting"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6 sm:space-y-8"
            >
              {/* Header Session Info */}
              <div className="text-center">
                <span className="bg-[#E0533C]/10 text-[#E0533C] text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full border border-[#E0533C]/20">
                  VOTING GATE IS OPEN
                </span>
                <h2 className="text-xl sm:text-3xl font-display font-black text-[#241C15] mt-3 uppercase tracking-wide">
                  {currentSession.title}
                </h2>
              </div>

              {/* Progress & Remaining Time */}
              <div className="bg-white rounded-2xl border border-[#BFA15F]/20 p-4 sm:p-6 shadow-sm space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center text-xs sm:text-sm font-bold">
                  <span className="text-[#241C15]/50 uppercase tracking-wider">Voting Time</span>
                  <span className={`text-sm sm:text-base ${votingRemaining <= 10 ? 'text-[#E0533C] font-black animate-pulse' : 'text-[#A07826] font-extrabold'}`}>
                    {formatDuration(votingRemaining)} remaining
                  </span>
                </div>
                <div className="w-full h-3 sm:h-4 bg-[#F4EFE6] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F] transition-all duration-300"
                    style={{ width: `${(votingRemaining / currentSession.duration) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Voter Rules / Voting Option Card */}
              {votedInCurrentSession ? (
                // Success screen if voted
                <div className="bg-white rounded-3xl border border-[#BFA15F]/20 p-8 sm:p-12 text-center shadow-md space-y-6">
                  <div className="inline-flex items-center justify-center p-4 rounded-full bg-green-50 text-green-500 border border-green-200">
                    <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#241C15]">VOTE SUBMITTED!</h3>
                  <p className="text-sm sm:text-base text-[#241C15]/60 font-semibold leading-relaxed">
                    You have successfully voted for:
                  </p>
                  <div className="flex flex-wrap gap-2.5 justify-center">
                    {selectedTeams.map(id => {
                      const t = db.teams.find(team => team.id === id);
                      return t ? (
                        <span key={id} className="bg-[#F4EFE6] text-[#A07826] font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-[#BFA15F]/20">
                          {t.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <p className="text-xs sm:text-sm text-[#241C15]/40 italic font-medium pt-5 border-t border-[#F4EFE6]">
                    Please wait for the organizer to end the session to reveal the results.
                  </p>
                </div>
              ) : (
                // Selection panel
                <div className="space-y-5">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-xs sm:text-sm uppercase font-extrabold tracking-wider text-[#241C15]/50">
                      Select up to {currentSession?.maxVotes || 1} {(currentSession?.maxVotes || 1) === 1 ? 'team' : 'teams'}:
                    </p>
                    <span className="text-xs sm:text-sm font-bold text-[#A07826]">
                      Selected {selectedTeams.length}/{currentSession?.maxVotes || 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {db.teams.map((t) => {
                      const isOwnTeam = t.id === user.teamId;
                      const isSelected = selectedTeams.includes(t.id);

                      // Resolve session-specific details with fallback to global team properties
                      const details = currentSession?.teamDetails?.[t.id];
                      const mediaUrl = details?.mediaUrl !== undefined ? details.mediaUrl : t.mediaUrl;
                      const mediaType = details?.mediaType !== undefined ? details.mediaType : t.mediaType;
                      const description = details?.description !== undefined ? details.description : t.description;

                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            if (isOwnTeam) return;
                            handleSelectTeam(t.id);
                          }}
                          className={`
                            relative rounded-2xl border transition-all duration-300 cursor-pointer select-none flex flex-col overflow-hidden bg-white
                            ${isOwnTeam
                              ? 'border-dashed border-[#BFA15F]/30 bg-[#F4EFE6]/30 opacity-65 cursor-not-allowed'
                              : isSelected
                                ? 'border-[#A07826] shadow-[0_8px_30px_rgba(160,120,38,0.12)] ring-1 ring-[#A07826]'
                                : 'border-[#BFA15F]/20 hover:border-[#A07826]/50 hover:shadow-md'
                            }
                          `}
                        >
                          {/* Media Header (only rendered if mediaUrl exists) */}
                          {mediaUrl ? (
                            <div className="aspect-video w-full bg-[#F4EFE6] relative overflow-hidden border-b border-[#BFA15F]/10">
                              {mediaType === 'video' ? (() => {
                                const embedUrl = getYouTubeEmbedUrl(mediaUrl);
                                return embedUrl ? (
                                  <iframe
                                    src={embedUrl}
                                    title={t.name}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                                    <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Invalid YouTube Link</p>
                                  </div>
                                );
                              })() : (
                                <img 
                                  src={mediaUrl} 
                                  alt={t.name} 
                                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" 
                                />
                              )}

                              {/* Floating checkbox */}
                              {!isOwnTeam && (
                                <div className="absolute top-3 right-3 z-10">
                                  <div
                                    className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                                      isSelected
                                        ? 'bg-[#A07826] border-[#A07826] text-white shadow-md scale-105'
                                        : 'bg-white/80 backdrop-blur-sm border-[#BFA15F]/40 text-transparent shadow-sm'
                                    }`}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}

                          {/* Content Body */}
                          <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-lg text-[#241C15]">{t.name}</h4>
                                <div className="flex items-center space-x-2">
                                  {isOwnTeam && (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-[#E0533C] bg-[#E0533C]/10 border border-[#E0533C]/20 px-2 py-0.5 rounded-full">
                                      Your Team
                                    </span>
                                  )}
                                  
                                  {/* Inline checkbox when there is no media layout */}
                                  {!mediaUrl && !isOwnTeam && (
                                    <div
                                      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                                        isSelected
                                          ? 'bg-[#A07826] border-[#A07826] text-white shadow-md scale-105'
                                          : 'bg-[#F4EFE6] border-[#BFA15F]/40 text-transparent shadow-sm'
                                      }`}
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {description && (
                                <p className="text-xs sm:text-sm text-[#241C15]/70 font-semibold mt-2 line-clamp-3 leading-relaxed">
                                  {description}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-[#F4EFE6] flex items-center justify-between text-xs font-bold">
                              {isOwnTeam ? (
                                <span className="text-[#E0533C]/85 uppercase tracking-wider text-[10px]">Cannot vote for your own team</span>
                              ) : isSelected ? (
                                <span className="text-[#A07826] uppercase tracking-wider text-[10px] flex items-center space-x-1">
                                  <span>●</span> <span>Selected</span>
                                </span>
                              ) : (
                                <span className="text-[#241C15]/40 uppercase tracking-wider text-[10px]">Click to select</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleVoteSubmit}
                    disabled={selectedTeams.length === 0 || votingRemaining <= 0}
                    className="w-full py-4 sm:py-5 bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F] disabled:opacity-50 text-white font-bold rounded-xl tracking-widest shadow-md hover:shadow-lg transition-all text-sm sm:text-base uppercase mt-4"
                  >
                    {votingRemaining <= 0 ? 'VOTING TIME EXPIRED' : `CONFIRM VOTE (${selectedTeams.length} votes)`}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* STATE 4: VOTING ENDED & RESULTS REVEAL */}
          {isEnded && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 sm:space-y-8"
            >
              <div className="text-center">
                <span className="bg-[#241C15]/10 text-[#241C15]/75 text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full border border-[#241C15]/20">
                  VOTING SESSION ENDED
                </span>
                <h2 className="text-xl sm:text-3xl font-display font-black text-[#241C15] mt-3 uppercase tracking-wide">
                  LEADERBOARD & RESULTS
                </h2>
                <p className="text-xs sm:text-sm text-[#241C15]/50 font-bold uppercase mt-1.5">
                  "{currentSession.title}"
                </p>
              </div>

              {/* Leaderboard Cards Container */}
              {animateResults ? (
                // Staggered reveal animation (bottom-to-top) - played ONLY once per session
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-4"
                >
                  {getResults().map((teamResult, index) => {
                    const percentage = (teamResult.votes / Math.max(1, teamResult.members.length)) * 100;
                    
                    const resultsList = getResults();
                    // Calculate correct rank under ties
                    const displayRank = resultsList.filter(r => r.votes > teamResult.votes).length + 1;
                    const isTop1 = displayRank === 1 && teamResult.votes > 0;

                    const rankBg = 
                      displayRank === 1 ? 'bg-[#B28E43]' :
                      displayRank === 2 ? 'bg-[#A7B9CB]' :
                      displayRank === 3 ? 'bg-[#C65D07]' :
                      'bg-[#CBD5E1]';

                    const progressColor = 
                      displayRank === 1 ? 'bg-[#C65D07]' :
                      displayRank === 2 ? 'bg-[#859BB5]' :
                      'bg-[#E5D7BE]';

                    return (
                      <motion.div
                        key={teamResult.id}
                        variants={itemVariants}
                        className="bg-white rounded-2xl p-5 border border-[#BFA15F]/20 shadow-sm flex items-center space-x-4 hover:shadow-md transition-shadow"
                      >
                        <div className="relative flex-shrink-0">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white flex-shrink-0 ${rankBg}`}>
                            {displayRank}
                          </div>
                          {isTop1 && (
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                              <div className="animate-bob">
                                <img src="/crown.png" alt="Crown" className="w-10 h-10 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.15)]" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex-grow">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <h4 className="font-bold text-base sm:text-lg text-[#241C15] leading-tight">{teamResult.name}</h4>
                              <p className="text-xs text-[#241C15]/40 font-semibold mt-0.5">{teamResult.members.length} members</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-lg sm:text-xl font-black ${index === 0 ? 'text-[#A07826]' : 'text-[#241C15]'}`}>
                                {teamResult.votes}
                              </span>
                              <span className="text-[9px] text-[#241C15]/40 font-bold uppercase block tracking-wider mt-0.5">
                                Votes Cast
                              </span>
                            </div>
                          </div>
                          {/* Visual progress bar */}
                          <div className="w-full h-2.5 bg-[#F4EFE6]/70 rounded-full overflow-hidden">
                            <motion.div 
                              className={`h-full rounded-full ${progressColor}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 1, delay: index * 0.1 }}
                            ></motion.div>
                          </div>
                          <div className="text-[9px] font-extrabold text-[#241C15]/30 uppercase tracking-widest mt-1">
                            VOTE RATIO
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              ) : (
                // Direct render (no animations) - shown upon page reload
                <div className="space-y-4">
                  {getResults().map((teamResult, index) => {
                    const percentage = (teamResult.votes / Math.max(1, teamResult.members.length)) * 100;

                    const resultsList = getResults();
                    // Calculate correct rank under ties
                    const displayRank = resultsList.filter(r => r.votes > teamResult.votes).length + 1;
                    const isTop1 = displayRank === 1 && teamResult.votes > 0;

                    const rankBg = 
                      displayRank === 1 ? 'bg-[#B28E43]' :
                      displayRank === 2 ? 'bg-[#A7B9CB]' :
                      displayRank === 3 ? 'bg-[#C65D07]' :
                      'bg-[#CBD5E1]';

                    const progressColor = 
                      displayRank === 1 ? 'bg-[#C65D07]' :
                      displayRank === 2 ? 'bg-[#859BB5]' :
                      'bg-[#E5D7BE]';

                    return (
                      <div
                        key={teamResult.id}
                        className="bg-white rounded-2xl p-5 border border-[#BFA15F]/20 shadow-sm flex items-center space-x-4 hover:shadow-md transition-shadow"
                      >
                        <div className="relative flex-shrink-0">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white flex-shrink-0 ${rankBg}`}>
                            {displayRank}
                          </div>
                          {isTop1 && (
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                              <div className="animate-bob">
                                <img src="/crown.png" alt="Crown" className="w-10 h-10 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.15)]" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex-grow">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <h4 className="font-bold text-base sm:text-lg text-[#241C15] leading-tight">{teamResult.name}</h4>
                              <p className="text-xs text-[#241C15]/40 font-semibold mt-0.5">{teamResult.members.length} members</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-lg sm:text-xl font-black ${index === 0 ? 'text-[#A07826]' : 'text-[#241C15]'}`}>
                                {teamResult.votes}
                              </span>
                              <span className="text-[9px] text-[#241C15]/40 font-bold uppercase block tracking-wider mt-0.5">
                                Votes Cast
                              </span>
                            </div>
                          </div>
                          {/* Visual progress bar */}
                          <div className="w-full h-2.5 bg-[#F4EFE6]/70 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${progressColor}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <div className="text-[9px] font-extrabold text-[#241C15]/30 uppercase tracking-widest mt-1">
                            VOTE RATIO
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Branding */}
      <footer className="py-6 text-center text-[10px] text-[#241C15]/30 font-semibold uppercase tracking-widest border-t border-[#BFA15F]/10 bg-white/50">
        Allumer le feu • Hoi An 2026
      </footer>
    </div>
  );
}
