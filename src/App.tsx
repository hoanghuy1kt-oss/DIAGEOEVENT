import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import VoterView from './components/VoterView';
import AdminPanel from './components/AdminPanel';
import ResultsView from './components/ResultsView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; teamId: string; teamName: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user session on mount
  useEffect(() => {
    const data = localStorage.getItem('spg_current_user');
    if (data) {
      try {
        setCurrentUser(JSON.parse(data));
      } catch (e) {
        localStorage.removeItem('spg_current_user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (user: { id: string; name: string; teamId: string; teamName: string }) => {
    localStorage.setItem('spg_current_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('spg_current_user');
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFAF6] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#BFA15F]/20 border-t-[#E0533C] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            currentUser ? (
              <VoterView user={currentUser} onLogout={handleLogout} />
            ) : (
              <Login onLogin={handleLogin} />
            )
          } 
        />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/results" element={<ResultsView />} />
        {/* Fallback routing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
