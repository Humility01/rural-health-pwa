import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './features/admin/views/LoginPage';
import RegistrationPage from './features/views/RegistrationPage';
import SearchPage from './features/views/SearchPage';
import AdminDashboard from './features/admin/views/AdminDashboard';
import SyncStatusIndicator from './components/layout/SyncStatusIndicator';

function DashboardLayout() {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('register'); // Tracking current active screen segment

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc', // Clean workspace background from reference spec
      fontFamily: '"Montserrat", "Segoe UI", sans-serif' 
    }}>
      
      {/* GLOBAL HEALTH HUB HEADER WRAPPER WITH INTEGRATED VECTOR BRAND LOGO */}
      <header style={{ 
        background: '#ffffff', 
        borderBottom: '1px solid #e2e8f0', 
        padding: '16px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* PREMIUM OUTLINE PULSE VECTOR BADGE CONTAINER - AS REQUESTED */}
          <div style={{ 
            width: '40px', 
            height: '40px', 
            background: 'rgba(0, 75, 246, 0.06)', // Soft color blend block
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#004bf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          
          <div>
            <h1 style={{ margin: 0, color: '#004bf6', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.75px' }}>
              RuralHealth Sync Core
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                Active Session: <strong style={{ color: '#334155' }}>{currentUser?.email}</strong>
              </span>
              <span style={{ 
                fontSize: '10px', 
                background: currentUser?.role === 'SUPER_ADMIN' ? 'rgba(0, 75, 246, 0.06)' : '#e6f4ea', 
                color: currentUser?.role === 'SUPER_ADMIN' ? '#004bf6' : '#137333', 
                padding: '2px 8px', 
                borderRadius: '6px', 
                fontWeight: '700', 
                textTransform: 'uppercase',
                letterSpacing: '0.25px'
              }}>
                {currentUser?.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN VIEW' : `${currentUser?.role} VIEW`}
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={logout}
          style={{ 
            background: '#ffffff', 
            color: '#dc2626', 
            border: '1px solid #fecaca', 
            padding: '8px 16px', 
            borderRadius: '10px', 
            fontSize: '13px', 
            fontWeight: '700', 
            fontFamily: '"Montserrat", sans-serif',
            cursor: 'pointer', 
            transition: 'all 0.2s ease' 
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#fff1f2';
            e.target.style.borderColor = '#fda4af';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = '#ffffff';
            e.target.style.borderColor = '#fecaca';
          }}
        >
          Secure Log Out
        </button>
      </header>

      {/* SYSTEM BACKGROUND DATAPIPELINE LIFECYCLE MONITOR */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <SyncStatusIndicator />

        {/* WORKSPACE SELECTION TABS */}
        <div style={{ display: 'flex', gap: '10px', margin: '24px 0 16px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <button 
            onClick={() => setActiveTab('register')}
            style={{ 
              padding: '10px 18px', 
              borderRadius: '10px', 
              border: 'none', 
              background: activeTab === 'register' ? '#004bf6' : 'transparent', 
              color: activeTab === 'register' ? 'white' : '#475569', 
              fontWeight: '700', 
              fontSize: '14px', 
              fontFamily: '"Montserrat", sans-serif',
              cursor: 'pointer', 
              transition: 'all 0.2s ease' 
            }}
          >
            Register Patient
          </button>
          
          <button 
            onClick={() => setActiveTab('search')}
            style={{ 
              padding: '10px 18px', 
              borderRadius: '10px', 
              border: 'none', 
              background: activeTab === 'search' ? '#004bf6' : 'transparent', 
              color: activeTab === 'search' ? 'white' : '#475569', 
              fontWeight: '700', 
              fontSize: '14px', 
              fontFamily: '"Montserrat", sans-serif',
              cursor: 'pointer', 
              transition: 'all 0.2s ease' 
            }}
          >
            Search Records
          </button>

          {/* UPGRADED PRIVILEGE BOUNDARY GATE */}
          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN') && (
            <button 
              onClick={() => setActiveTab('admin')}
              style={{ 
                padding: '10px 18px', 
                borderRadius: '10px', 
                border: 'none', 
                background: activeTab === 'admin' ? '#004bf6' : 'transparent', 
                color: activeTab === 'admin' ? 'white' : '#475569', 
                fontWeight: '700', 
                fontSize: '14px', 
                fontFamily: '"Montserrat", sans-serif',
                cursor: 'pointer', 
                transition: 'all 0.2s ease' 
              }}
            >
              System Administration
            </button>
          )}
        </div>

        {/* DYNAMIC SCREEN ROUTING VIEW CONTEXTS */}
        <main style={{ marginTop: '12px' }}>
          {activeTab === 'register' && <RegistrationPage />}
          {activeTab === 'search' && <SearchPage />}
          {activeTab === 'admin' && (currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN') && <AdminDashboard />}
        </main>
      </div>

    </div>
  );
}

// SECURE CORE MAIN GATEWAY WRAPPER CONTEXT
function MainAppContent() {
  const { currentUser, loading } = useAuth(); // 🌟 Grab loading context if available
  
  // 🟢 Guard condition: Wait if context initialization is pending
  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: '"Montserrat", sans-serif' }}>
        <p style={{ fontWeight: '600', color: '#64748b', fontSize: '14px' }}>Initializing Authentication Handshakes...</p>
      </div>
    );
  }
  
  // If no user token exists in browser storage layout, force lock at the Auth Gate
  if (!currentUser) {
    return <LoginPage />;
  }

  return <DashboardLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      {/* GLOBAL TYPOGRAPHY BALANCING ENGINE STYLE BLOCK */}
      <style>{`
        * {
          font-family: "Montserrat", "Segoe UI", sans-serif !important;
          letter-spacing: -0.15px;
          box-sizing: border-box;
        }
        input, select, textarea, button {
          font-family: "Montserrat", sans-serif !important;
        }
      `}</style>
      
      <MainAppContent />
    </AuthProvider>
  );
}