import React, { useState, useEffect } from 'react';
import { getDB, subscribeToDB, getYouTubeEmbedUrl, Team, VotingSession, formatDuration } from '../lib/database';
import { motion, AnimatePresence } from 'framer-motion';


export default function ResultsView() {
  const [db, setDb] = useState(getDB());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Subscribe to DB updates for real-time changes
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

  const visibleSessions = db.sessions.filter(s => 
    s.id === db.currentSessionId || 
    s.status === 'countdown' || 
    s.status === 'voting' || 
    s.status === 'ended'
  );

  const activeSession = db.sessions.find(s => s.id === db.currentSessionId) || null;

  // Set default selected session to active session
  useEffect(() => {
    if (db.currentSessionId && !selectedSessionId) {
      setSelectedSessionId(db.currentSessionId);
    } else if (visibleSessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(visibleSessions[0].id);
    }
  }, [db.currentSessionId, visibleSessions, selectedSessionId]);

  const selectedSession = visibleSessions.find(s => s.id === selectedSessionId) || activeSession || (visibleSessions.length > 0 ? visibleSessions[0] : null);

  // Helper stats
  const totalRegisteredMembers = db.teams.reduce((acc, t) => acc + t.members.length, 0);

  // Calculate results for the selected session
  const getLeaderboard = () => {
    if (!selectedSession) return [];

    const resultsMap: Record<string, number> = {};
    db.teams.forEach(t => {
      resultsMap[t.id] = 0;
    });

    Object.values(selectedSession.votes).forEach(votes => {
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

  if (!selectedSession) {
    return (
      <div className="min-h-screen bg-[#FCFAF6] text-[#241C15] font-sans flex flex-col justify-between pb-12">
        {/* Header */}
        <header className="bg-white border-b border-[#BFA15F]/20 px-8 py-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4">
            <img src="/logo.png" alt="SPG Logo" className="object-contain" style={{ height: '48px', width: 'auto', display: 'block' }} />
            <div className="border-l border-[#BFA15F]/30 pl-4">
              <h1 className="text-lg md:text-xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F]">
                ALLUMER LE FEU - LIVE RESULTS
              </h1>
              <p className="text-[10px] text-[#241C15]/50 font-bold uppercase mt-1 tracking-widest">
                Realtime Event Voting Leaderboard
              </p>
            </div>
          </div>
        </header>

        {/* Welcome Message */}
        <main className="max-w-6xl mx-auto w-full px-8 py-10 flex-grow flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 90, damping: 15 }}
            className="bg-white rounded-3xl border border-[#BFA15F]/20 p-12 shadow-[0_20px_50px_rgba(160,120,38,0.06)] space-y-6 max-w-2xl w-full"
          >
            <div className="inline-flex items-center justify-center p-4 rounded-full bg-[#F4EFE6] text-[#A07826]">
              <svg className="w-10 h-10 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"></path>
              </svg>
            </div>
            <h2 className="text-3xl font-display font-black tracking-wide text-[#241C15] uppercase">
              Ready for "Allumer le feu"
            </h2>
            <p className="text-base text-[#241C15]/60 font-semibold leading-relaxed">
              SPG Year End Event 2026 Live Leaderboard.
              <br />
              Please wait for the organizer to activate and start the voting sessions!
            </p>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="text-center text-[10px] text-[#241C15]/30 font-bold uppercase tracking-widest mt-12">
          SPG Year End Event 2026 • Live Voting System • Allumer le feu
        </footer>
      </div>
    );
  }

  const leaderboard = getLeaderboard();
  const votesCount = selectedSession ? Object.keys(selectedSession.votes).length : 0;

  return (
    <div className="min-h-screen bg-[#FCFAF6] text-[#241C15] font-sans flex flex-col justify-between pb-12">
      {/* Header */}
      <header className="bg-white border-b border-[#BFA15F]/20 px-8 py-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div className="flex items-center space-x-4">
          <img src="/logo.png" alt="SPG Logo" className="object-contain" style={{ height: '48px', width: 'auto', display: 'block' }} />
          <div className="border-l border-[#BFA15F]/30 pl-4">
            <h1 className="text-lg md:text-xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F]">
              ALLUMER LE FEU - LIVE RESULTS
            </h1>
            <p className="text-[10px] text-[#241C15]/50 font-bold uppercase mt-1 tracking-widest">
              Realtime Event Voting Leaderboard
            </p>
          </div>
        </div>

        {/* Dropdown Selector for Sessions */}
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold text-[#241C15]/60 uppercase tracking-wider">Select Voting Session:</label>
          <select
            value={selectedSessionId || ''}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="bg-[#F4EFE6]/60 border border-[#BFA15F]/30 rounded-xl px-4 py-2.5 text-xs font-bold text-[#241C15] focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 transition-all cursor-pointer"
          >
            {visibleSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} {s.id === db.currentSessionId ? '(Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-6xl mx-auto w-full px-8 py-10 flex-grow grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Side: Session Detail card */}
        <div className="space-y-6 lg:col-span-1">
          {selectedSession ? (
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              className="bg-white border border-[#BFA15F]/20 rounded-3xl p-8 shadow-[0_15px_40px_rgba(160,120,38,0.06)] space-y-6"
            >
              <div>
                <span className={`
                  text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border
                  ${selectedSession.status === 'waiting' && 'bg-blue-50 text-blue-600 border-blue-200'}
                  ${selectedSession.status === 'countdown' && 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse'}
                  ${selectedSession.status === 'voting' && 'bg-red-50 text-red-600 border-red-200 animate-pulse'}
                  ${selectedSession.status === 'ended' && 'bg-[#F4EFE6] text-[#241C15]/60 border-[#BFA15F]/20'}
                `}>
                  {selectedSession.status === 'waiting' && 'Waiting'}
                  {selectedSession.status === 'countdown' && 'Counting Down'}
                  {selectedSession.status === 'voting' && 'Voting Active'}
                  {selectedSession.status === 'ended' && 'Voting Ended'}
                </span>
                
                <h2 className="text-2xl font-black text-[#241C15] mt-4 leading-tight">
                  {selectedSession.title}
                </h2>
                <p className="text-xs text-[#A07826] font-semibold mt-2 uppercase tracking-wider">
                  Configured Duration: {formatDuration(selectedSession.duration)}
                </p>
              </div>

              {/* Voting statistics */}
              <div className="bg-[#F4EFE6]/30 border border-[#BFA15F]/15 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center text-xs font-bold text-[#241C15]/50 uppercase tracking-wider">
                  <span>Voter Turnout</span>
                  <span className="text-[#A07826] font-extrabold">
                    {votesCount} / {totalRegisteredMembers} Voted
                  </span>
                </div>
                <div className="w-full h-3 bg-[#F4EFE6]/70 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(votesCount / Math.max(1, totalRegisteredMembers)) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  ></motion.div>
                </div>
                <div className="flex justify-between text-[10px] font-semibold text-[#241C15]/40 uppercase tracking-widest">
                  <span>Total Members: {totalRegisteredMembers}</span>
                  <span>{((votesCount / Math.max(1, totalRegisteredMembers)) * 100).toFixed(0)}% Done</span>
                </div>
              </div>

              {/* Status explanation */}
              <div className="text-xs text-[#241C15]/60 leading-relaxed font-medium pt-4 border-t border-[#BFA15F]/15">
                {selectedSession.status === 'waiting' && 'Voter screens are currently locked. Waiting for host to open the voting gate.'}
                {selectedSession.status === 'countdown' && (() => {
                  const elapsed = selectedSession.countdownStartedAt ? (Date.now() - selectedSession.countdownStartedAt) / 1000 : 0;
                  const rem = Math.max(0, 10 - elapsed);
                  return `A 10-second countdown is in progress (${formatDuration(rem)} remaining). The voting list will appear automatically.`;
                })()}
                {selectedSession.status === 'voting' && (() => {
                  const elapsed = selectedSession.votingStartedAt ? (Date.now() - selectedSession.votingStartedAt) / 1000 : 0;
                  const rem = Math.max(0, selectedSession.duration - elapsed);
                  return `Voting is active (${formatDuration(rem)} remaining)! Voters are submitting their choices. Results are updating in real-time below.`;
                })()}
                {selectedSession.status === 'ended' && 'The voting gate has closed. Results are locked and finalized.'}
              </div>
            </motion.div>
          ) : (
            <div className="bg-white border border-[#BFA15F]/20 rounded-3xl p-8 text-center text-[#241C15]/40 italic py-12">
              No sessions available. Please create one in the Admin Panel.
            </div>
          )}
        </div>

        {/* Right Side: Leaderboard list */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.1 }}
          className="lg:col-span-2 space-y-4"
        >
          <h3 className="font-extrabold text-sm uppercase tracking-widest text-[#241C15]/50 mb-2">
            Realtime Leaderboard
          </h3>

          {selectedSession && leaderboard.length > 0 ? (
            <motion.div layout className="space-y-4">
              <AnimatePresence mode="popLayout">
                {leaderboard.map((team, index) => {
                  const pct = (team.votes / Math.max(1, team.members.length)) * 100;
                  
                  // Calculate correct rank under ties
                  const displayRank = leaderboard.filter(t => t.votes > team.votes).length + 1;
                  const isTop1 = displayRank === 1 && team.votes > 0;
                  
                  // Rank styling
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
                      layout
                      key={team.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className={`bg-white border transition-all duration-300 rounded-2xl p-5 flex items-center space-x-5 hover:border-[#BFA15F]/40 hover:shadow-md ${
                        isTop1 ? 'border-[#BFA15F]/30 shadow-[0_8px_30px_rgba(160,120,38,0.04)]' : 'border-[#BFA15F]/15'
                      }`}
                    >
                      {/* Rank Circle with floating Crown for Top 1 */}
                      <div className="relative flex-shrink-0">
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white flex-shrink-0 ${rankBg}`}
                        >
                          {displayRank}
                        </motion.div>
                        {isTop1 && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                            <div className="animate-bob">
                              <img src="/crown.png" alt="Crown" className="w-10 h-10 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.15)]" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Progress details */}
                      <div className="flex-grow space-y-2.5">
                        <div className="flex justify-between items-end">
                          <div>
                            <h4 className="font-bold text-lg text-[#241C15] leading-tight">
                              {team.name}
                            </h4>
                            <span className="text-xs text-[#241C15]/40 font-medium">
                              {team.members.length} members
                            </span>
                          </div>

                          {/* Votes Score */}
                          <div className="text-right">
                            <span className={`text-xl font-black ${index === 0 ? 'text-[#A07826]' : 'text-[#241C15]'}`}>
                              {team.votes}
                            </span>
                            <span className="text-[10px] text-[#241C15]/40 font-bold uppercase block tracking-wider mt-0.5">
                              Votes Cast
                            </span>
                          </div>
                        </div>

                        {/* Visual progress bar */}
                        <div className="w-full h-3 bg-[#F4EFE6]/70 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${progressColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          ></motion.div>
                        </div>

                        <div className="text-[9px] font-extrabold text-[#241C15]/30 uppercase tracking-widest mt-1">
                          VOTE RATIO
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="bg-white border border-[#BFA15F]/15 rounded-2xl p-8 text-center text-[#241C15]/40 italic">
              No results available for this session.
            </div>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-[#241C15]/30 font-bold uppercase tracking-widest mt-12">
        SPG Year End Event 2026 • Live Voting System • Allumer le feu
      </footer>
    </div>
  );
}
