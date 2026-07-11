import React, { createContext, useContext, useState, useEffect } from 'react';
import { localDb } from '../core/db/localDb';
import { supabase } from '../core/supabase/client'; // Import your live Supabase core instance

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================================================================
  // 🔄 HYBRID IDENTITY STATE LIFECYCLE MONITOR
  // =========================================================================
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // 1. First attempt to restore local disk storage cache
        const cachedSession = localStorage.getItem('active_session_user');
        if (cachedSession) {
          setCurrentUser(JSON.parse(cachedSession));
        }

        // 2. Safely query Supabase for active network tokens to confirm cloud sessions
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await syncCloudUserToContext(session.user.email);
        }
      } catch (err) {
        console.warn('Session parsing fallback trace warning:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();

    // 📡 Live Network Channel Intercept listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await syncCloudUserToContext(session.user.email);
      } else {
        // Clean state parameters if session explicitly signs out or expires
        setCurrentUser(null);
        localStorage.removeItem('active_session_user');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Structural mapping helper to translate cloud sessions into custom local states safely
  const syncCloudUserToContext = async (userEmail) => {
    try {
      const cleanEmail = String(userEmail || '').trim().toLowerCase();
      const localMatch = await localDb.users.where('email').equalsIgnoreCase(cleanEmail).first();
      
      if (localMatch) {
        const sessionData = { 
          user_id: localMatch.user_id, 
          email: localMatch.email, 
          role: localMatch.role,
          facility_id: localMatch.facility_id 
        };
        setCurrentUser(sessionData);
        localStorage.setItem('active_session_user', JSON.stringify(sessionData));
      }
    } catch (e) {
      console.warn("Mismatched database tables context sync bypass:", e);
    }
  };

  // Updated Login function that handles both standard string logins AND direct profile object overrides
  const login = async (email, password) => {
    // 🛡️ OBJECT PASS-THROUGH INTERCEPT: If an object comes in directly from LoginPage, save it immediately!
    if (typeof email === 'object' && email !== null) {
      const userProfile = email;
      const sessionData = { 
        user_id: userProfile.user_id, 
        email: userProfile.email, 
        role: userProfile.role,
        facility_id: userProfile.facility_id 
      };
      setCurrentUser(sessionData);
      localStorage.setItem('active_session_user', JSON.stringify(sessionData));
      return { success: true, role: userProfile.role };
    }

    // Standard string credentials pathway
    const cleanEmail = String(email || '').trim().toLowerCase();
    
    // Simulate encryption processing latency (Looks premium during defense!)
    await new Promise(resolve => setTimeout(resolve, 850));

    if (!cleanEmail || !password) {
      throw new Error('Please enter both your institutional email and security passcode.');
    }

    // =========================================================================
    // 🌐 LAYER 1: GOOGLE WORKSPACE OAUTH TOKEN OVERRIDE INTERCEPT
    // =========================================================================
    if (password === "BYPASS_LOCAL_PASSCODE_OAUTH_TOKEN") {
      try {
        const localGoogleUser = await localDb.users.where('email').equals(cleanEmail).first();
        if (localGoogleUser) {
          const sessionData = { 
            user_id: localGoogleUser.user_id, 
            email: localGoogleUser.email, 
            role: localGoogleUser.role 
          };
          setCurrentUser(sessionData);
          localStorage.setItem('active_session_user', JSON.stringify(sessionData));
          return { success: true, role: localGoogleUser.role };
        }
      } catch (dbErr) {
        console.warn('Google Identity Token caching mapping error:', dbErr);
      }
    }

    // =========================================================================
    // 📴 LAYER 2: OFFLINE FALLBACK - LOCAL INDEXEDDB VAULT RUNTIME LOOP
    // =========================================================================
    try {
      const localMatch = await localDb.users.where('email').equals(cleanEmail).first();
      if (localMatch) {
        if (password === localMatch.password) {
          const sessionData = { 
            user_id: localMatch.user_id, 
            email: localMatch.email, 
            role: localMatch.role,
            facility_id: localMatch.facility_id
          };
          setCurrentUser(sessionData);
          localStorage.setItem('active_session_user', JSON.stringify(sessionData));
          return { success: true, role: localMatch.role };
        } else {
          throw new Error('Access Denied: Invalid passcode token match for this device node.');
        }
      }
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes('Access Denied')) throw dbErr;
      console.warn('Local database storage read warning:', dbErr);
    }

    // =========================================================================
    // 💻 LAYER 3: HARDCODED ROOT INITIALIZATION DEVICE FALLBACK (Updated to admin2000)
    // =========================================================================
    if (cleanEmail === 'humilitypraise1057@gmail.com' && password === 'admin2000') {
      const adminSession = { 
        user_id: 'master-admin-uuid', 
        email: cleanEmail, 
        role: 'SUPER_ADMIN',
        facility_id: '00000000-0000-0000-0000-000000000000'
      };
      setCurrentUser(adminSession);
      localStorage.setItem('active_session_user', JSON.stringify(adminSession));
      
      try {
        if (localDb && localDb.users) {
          await localDb.users.put({ 
            user_id: 'master-admin-uuid', 
            email: cleanEmail, 
            role: 'SUPER_ADMIN', 
            password: 'admin2000',
            facility_id: '00000000-0000-0000-0000-000000000000'
          });
        }
      } catch (e) {}
      return { success: true, role: 'SUPER_ADMIN' };
    }

    throw new Error('Authentication Rejected: Unauthorized credentials or unprovisioned node cache.');
  };

  // Logout routine handling state scrubbing
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setCurrentUser(null);
    localStorage.removeItem('active_session_user');
    localStorage.removeItem('ACTIVE_OPERATOR_TOKEN');
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom Hook consumption framework export
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be consumed inside an AuthProvider framework.');
  }
  return context;
}