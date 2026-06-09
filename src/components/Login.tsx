import React, { useState, useEffect } from 'react';
import { getDB, subscribeToDB, Team, Member } from '../lib/database';
import { motion } from 'framer-motion';

interface LoginProps {
  onLogin: (user: { id: string; name: string; teamId: string; teamName: string }) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');

  // Search autocomplete states
  const [searchText, setSearchText] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Load teams and keep updated
  useEffect(() => {
    const unsubscribe = subscribeToDB((freshDb) => {
      setTeams(freshDb.teams);
    });
    return () => unsubscribe();
  }, []);

  // Reset member selection if team changes and the selected member is not in the new team
  useEffect(() => {
    if (selectedTeamId) {
      const team = teams.find(t => t.id === selectedTeamId);
      const isMemberInTeam = team?.members.some(m => m.id === selectedMemberId);
      if (!isMemberInTeam && selectedMemberId) {
        setSelectedMemberId('');
        setSearchText('');
      }
    }
  }, [selectedTeamId, teams, selectedMemberId]);

  // Accent-insensitive and case-insensitive Vietnamese string cleaner
  const stripAccents = (str: string) => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  };

  // Compute all members across all teams
  const allMembersWithTeam = React.useMemo(() => {
    const list: { member: Member; team: Team }[] = [];
    teams.forEach(t => {
      t.members.forEach(m => {
        list.push({ member: m, team: t });
      });
    });
    return list;
  }, [teams]);

  // Filter members based on search text and selected team
  const filteredMembers = React.useMemo(() => {
    const cleanSearch = stripAccents(searchText.toLowerCase());
    if (selectedTeamId) {
      const team = teams.find(t => t.id === selectedTeamId);
      const teamMembers = team ? team.members : [];
      return teamMembers
        .filter(m => stripAccents(m.name.toLowerCase()).includes(cleanSearch))
        .map(m => ({ member: m, team: team! }));
    } else {
      return allMembersWithTeam.filter(item =>
        stripAccents(item.member.name.toLowerCase()).includes(cleanSearch)
      );
    }
  }, [selectedTeamId, teams, allMembersWithTeam, searchText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId || !selectedMemberId) return;

    const team = teams.find(t => t.id === selectedTeamId);
    if (!team) return;
    const member = team.members.find(m => m.id === selectedMemberId);

    if (member) {
      onLogin({
        id: member.id,
        name: member.name,
        teamId: team.id,
        teamName: team.name
      });
    }
  };

  const formItemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
  };

  return (
    <div className="min-h-screen bg-[#FCFAF6] flex flex-col justify-between pb-12 font-sans text-[#241C15]">
      {/* Main Login Card */}
      <div className="flex-grow flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 85, damping: 20 }}
          className="w-full max-w-md sm:max-w-xl bg-white rounded-3xl border border-[#BFA15F]/20 p-8 sm:p-12 shadow-[0_20px_50px_rgba(160,120,38,0.08)] backdrop-blur-md transition-all"
        >
          {/* Logo & Slogan */}
          <div className="text-center mb-8">
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
              src="/logo.png"
              alt="SPG Logo"
              className="w-24 sm:w-32 h-auto mx-auto mb-4 object-contain"
            />
            <h2 className="text-2xl sm:text-3xl font-display font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#765410] via-[#A07826] to-[#BFA15F] uppercase mb-1">
              ALLUMER LE FEU
            </h2>
            <p className="text-[10px] sm:text-xs uppercase tracking-widest text-[#241C15]/50 font-bold">
              SPG Year End Trip 2026
            </p>
          </div>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-6 sm:space-y-8"
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.12,
                  delayChildren: 0.1
                }
              }
            }}
          >
            {/* Team Dropdown */}
            <motion.div variants={formItemVariants} className="space-y-2">
              <label htmlFor="team-select" className="block text-sm sm:text-base font-bold tracking-wide text-[#241C15]/75">
                SELECT YOUR TEAM
              </label>
              <div className="relative">
                <select
                  id="team-select"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full appearance-none bg-[#F4EFE6]/60 border border-[#BFA15F]/30 hover:border-[#A07826] rounded-xl px-4 py-4 sm:py-5 text-base sm:text-lg font-semibold text-[#241C15] focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 focus:border-[#A07826] transition-all cursor-pointer"
                >
                  <option value="">-- All Teams (Select to filter) --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#A07826]">
                  <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </motion.div>

            {/* Searchable Member Dropdown */}
            <motion.div variants={formItemVariants} className="space-y-2 relative">
              <label className="block text-sm sm:text-base font-bold tracking-wide text-[#241C15]/75">
                FIND & SELECT YOUR NAME
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type to find your name..."
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setIsDropdownOpen(true);
                    
                    // If they type an exact match (accent-insensitive), pre-select it
                    const cleanVal = stripAccents(e.target.value.toLowerCase());
                    const match = allMembersWithTeam.find(
                      item => stripAccents(item.member.name.toLowerCase()) === cleanVal &&
                      (!selectedTeamId || item.team.id === selectedTeamId)
                    );
                    if (match) {
                      setSelectedMemberId(match.member.id);
                      setSelectedTeamId(match.team.id);
                    } else {
                      setSelectedMemberId('');
                    }
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => setIsDropdownOpen(false)}
                  className="w-full bg-[#F4EFE6]/60 border border-[#BFA15F]/30 hover:border-[#A07826] rounded-xl px-4 py-4 sm:py-5 pr-10 text-base sm:text-lg font-semibold text-[#241C15] focus:outline-none focus:ring-2 focus:ring-[#A07826]/30 focus:border-[#A07826] transition-all"
                />
                <div 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-[#A07826] cursor-pointer"
                >
                  <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>

              {isDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#BFA15F]/20 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredMembers.length === 0 ? (
                    <p className="px-4 py-3 sm:py-4 text-sm sm:text-base text-[#241C15]/40 italic">No members found</p>
                  ) : (
                    filteredMembers.map((item) => (
                      <div
                        key={item.member.id}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevents input blur before click registers
                          setSelectedMemberId(item.member.id);
                          setSelectedTeamId(item.team.id);
                          setSearchText(item.member.name);
                          setIsDropdownOpen(false);
                        }}
                        className={`px-4 py-3 sm:py-4 text-base sm:text-lg font-semibold cursor-pointer transition-colors hover:bg-[#F4EFE6]/50 flex items-center justify-between ${
                          selectedMemberId === item.member.id ? 'bg-[#A07826]/10 text-[#A07826]' : 'text-[#241C15]'
                        }`}
                      >
                        <span>{item.member.name}</span>
                        <span className="text-[10px] sm:text-xs uppercase tracking-wider bg-[#BFA15F]/10 text-[#A07826] px-2 py-0.5 rounded-md font-bold">
                          {item.team.name}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </motion.div>

            {/* Login Button */}
            <motion.button
              variants={formItemVariants}
              type="submit"
              disabled={!selectedTeamId || !selectedMemberId}
              className="w-full py-4 sm:py-5 rounded-xl font-bold tracking-widest text-white shadow-lg bg-gradient-to-r from-[#E0533C] via-[#A07826] to-[#BFA15F] hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none mt-4 uppercase text-sm sm:text-base"
            >
              LOGIN
            </motion.button>
          </motion.form>
        </motion.div>
      </div>

      {/* Footer Branding */}
      <div className="text-center text-xs text-[#241C15]/40 mt-4 px-4 font-semibold uppercase tracking-wider">
        Ignite the Spirit • Spark Collaboration • Fuel the Future
      </div>
    </div>
  );
}
