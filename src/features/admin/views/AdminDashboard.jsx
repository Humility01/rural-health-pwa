import React, { useState, useEffect } from 'react';
import { localDb } from '../../../core/db/localDb';

// Direct path link module to talk to your permanent online Supabase database core
import { supabase } from '../../../core/supabase/client';
const supabaseLive = supabase;

export default function AdminDashboard() {
  // ---  User Management State ---
  const [systemUsers, setSystemUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('NURSE');
  const [processing, setProcessing] = useState(false);
  
  // ---  Diagnostics & Storage State ---
  const [cachedProfilesCount, setCachedProfilesCount] = useState(0);
  const [encounterLogsCount, setEncounterLogsCount] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);
  const [activeTab, setActiveTab] = useState('patients'); // 'patients', 'encounters', 'audit-logs', or 'sync-outbox'
  const [localPatients, setLocalPatients] = useState([]);
  const [localEncounters, setLocalEncounters] = useState([]);
  const [localOutboxRows, setLocalOutboxRows] = useState([]); 
  
  // --- 🌟 Facility Dynamic Tenant State (Table 3.10 Compliance) ---
  const [facilityName, setFacilityName] = useState('Loading Clinic...');
  const [facilityLocation, setFacilityLocation] = useState('Syncing Node Address...');

  // --- Security Audit Log State ---
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const [adminStatus, setAdminStatus] = useState({ text: '', type: '' });

  // Fallback 3NF structural layout placeholder link
  const currentFacilityId = '00000000-0000-0000-0000-000000000000';

  // Load everything on system mount
  useEffect(() => {
    refreshAdminDashboardCore();
  }, []);

  // Fetch real-time security audit trails whenever activeTab switches or criteria changes
  useEffect(() => {
    if (activeTab === 'audit-logs') {
      fetchLiveAuditLogs();
    }
  }, [activeTab, filterUser, filterAction]);

  const refreshAdminDashboardCore = async () => {
    try {
      // 1. Fetch Diagnostics Counts from updated ERD-compliant tables
      const encounterCount = await localDb.visit.count(); // Switched to singular 'visit' table
      const pendingSyncCount = await localDb.sync_outbox.where('synced').equals(0).count();

      setEncounterLogsCount(encounterCount);
      setOutboxCount(pendingSyncCount);

      // 🌟 2. Fetch Facility Information Dynamically from active LocalDB/Cloud context
      let resolvedName = "Futminna Healthcare";
      let resolvedLocation = "Minna, Niger State, Nigeria";
      let resolvedId = currentFacilityId; // Default fallback ID

      try {
        // 🔄 FETCH: Fetch all cached users locally stored on this testing browser
        const cachedUsers = await localDb.users.toArray();
        
        // Try parsing every possible session state token storage wrap used by your Auth provider
        let activeEmail = "";
        const storageKeys = ['user', 'session', 'active_user', 'supabase.auth.token'];
        
        for (const key of storageKeys) {
          const rawItem = localStorage.getItem(key);
          if (rawItem) {
            try {
              const parsed = JSON.parse(rawItem);
              // Handle nested user objects from Supabase token storage structures
              const emailCandidate = parsed.currentSession?.user?.email || parsed.user?.email || parsed.email;
              if (emailCandidate) {
                activeEmail = emailCandidate;
                break;
              }
            } catch {
              if (typeof rawItem === 'string' && rawItem.includes('@')) {
                activeEmail = rawItem;
                break;
              }
            }
          }
        }

        // Find the exact row matching the current signed-in email
        let activeUserRecord = null;
        if (activeEmail) {
          activeUserRecord = cachedUsers.find(u => u.email.trim().toLowerCase() === activeEmail.trim().toLowerCase());
        }

        // Forceful Fallback: If no exact email match is isolated, match by looking at who was added LAST
        if (!activeUserRecord && cachedUsers.length > 0) {
          activeUserRecord = cachedUsers[cachedUsers.length - 1];
        }

        if (activeUserRecord && activeUserRecord.facility_id) {
          resolvedId = activeUserRecord.facility_id;
          // Look up matching details from local facilities store
          const matchedFacility = await localDb.facilities.get(activeUserRecord.facility_id);
          if (matchedFacility) {
            resolvedName = matchedFacility.facility_name || resolvedName;
            resolvedLocation = matchedFacility.location || matchedFacility.facility_location || resolvedLocation;
          }
        }
      } catch (localDbErr) {
        console.warn("Could not query local IndexedDB facilities profile:", localDbErr);
      }

      // 🔄 Query the exact facility_id instead of bypassing the filter checks
      if (supabaseLive && resolvedId) {
        try {
          const { data: facilitiesList, error: facError } = await supabaseLive
            .from('facilities')
            .select('facility_name, location')
            .eq('facility_id', resolvedId)
            .maybeSingle();
          
          if (!facError && facilitiesList) {
            resolvedName = facilitiesList.facility_name || resolvedName;
            resolvedLocation = facilitiesList.location || resolvedLocation;

            // Seed local database cache so offline works perfectly on the next hot reload
            await localDb.facilities.put({
              facility_id: resolvedId,
              facility_name: resolvedName,
              location: resolvedLocation
            });
          }
        } catch (netErr) {
          console.warn("Network offline. Displaying local facility cache identifiers:", netErr);
        }
      }

      setFacilityName(resolvedName);
      setFacilityLocation(resolvedLocation);

      // 🌟 3. Fetch Raw Table Arrays for the Registry Viewers (Tenant-Isolated)
      const allPatientsArray = await localDb.patients.toArray();
      // Filter out only the profiles belonging to this active facility context
      const patientsArray = allPatientsArray.filter(p => p.facility_id === resolvedId);
      
      // Sync metric badge count card to show facility-isolated totals
      setCachedProfilesCount(patientsArray.length);

      const rawVisitsArray = await localDb.visit.toArray(); // Switched to singular 'visit' table
      
      // Fetch unsynced local outbox rows for our structural queue viewer
      const outboxArray = await localDb.sync_outbox.where('synced').equals(0).toArray();
      setLocalOutboxRows(outboxArray);

      // Multi-table relational map assembler to hydrate UI view rows on the dashboard layout
      const compiledEncountersArray = await Promise.all(
        rawVisitsArray.map(async (v) => {
          const complaintRow = await localDb.complaint.where('visit_id').equals(v.visit_id).first();
          const examinationRow = await localDb.examination.where('visit_id').equals(v.visit_id).first();
          return {
            ...v,
            presenting_complaint: complaintRow?.symptom || 'General Consultation',
            diagnosis_notes: examinationRow?.diagnosis_notes || 'Pending'
          };
        })
      );
      
      setLocalPatients(patientsArray);
      setLocalEncounters(compiledEncountersArray);

      // 🌟 4. Fetch Active Staff Account Registry Matrix (Filtered by Facility ID)
      const allUsers = await localDb.users.toArray();
      
      // Filter out only the staff members that belong to this specific logged-in facility node
      const filteredUsers = allUsers.filter(user => user.facility_id === resolvedId);
      
      setSystemUsers(filteredUsers);
      
    } catch (err) {
      console.error("Critical error hydrating administrative database collections:", err);
    }
  };

  // =========================================================================
  // 🛡️ --- FETCH LIVE AUDIT LOGS FROM SUPABASE (TENANT-ISOLATED) ---
  // =========================================================================
  const fetchLiveAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      
      // 1. Isolate the active logged-in user context to extract their facility identifier
      let resolvedId = null;
      try {
        const cachedUsers = await localDb.users.toArray();
        let activeEmail = "";
        const storageKeys = ['user', 'session', 'active_user', 'supabase.auth.token'];
        
        for (const key of storageKeys) {
          const rawItem = localStorage.getItem(key);
          if (rawItem) {
            try {
              const parsed = JSON.parse(rawItem);
              const emailCandidate = parsed.currentSession?.user?.email || parsed.user?.email || parsed.email;
              if (emailCandidate) {
                activeEmail = emailCandidate;
                break;
              }
            } catch {
              if (typeof rawItem === 'string' && rawItem.includes('@')) {
                activeEmail = rawItem;
                break;
              }
            }
          }
        }

        let activeUserRecord = null;
        if (activeEmail) {
          activeUserRecord = cachedUsers.find(u => u.email.trim().toLowerCase() === activeEmail.trim().toLowerCase());
        }
        if (!activeUserRecord && cachedUsers.length > 0) {
          activeUserRecord = cachedUsers[cachedUsers.length - 1];
        }
        resolvedId = activeUserRecord?.facility_id;
      } catch (e) {
        console.warn("Could not isolate active facility ID for audit trail:", e);
      }

      // 2. Fetch user_ids for staff members registered under this facility node
      const localStaff = await localDb.users.toArray();
      const tenantStaffIds = localStaff
        .filter(u => u.facility_id === resolvedId)
        .map(u => u.user_id);

      // Early layout escape path if zero local operator entries match
      if (tenantStaffIds.length === 0) {
        setAuditLogs([]);
        setLoadingAudit(false);
        return;
      }

      // 3. Assemble filtered cloud database fetch payload queries
      let query = supabaseLive
        .from('audit_log')
        .select('*')
        .in('user_id', tenantStaffIds) // 🔒 Security Gate: Confines lookups strictly to tenant operators
        .order('timestamp', { ascending: false });

      if (filterAction) {
        query = query.eq('action', filterAction);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Local fuzzy filter for username matching to handle relational string evaluation neatly
      if (filterUser) {
        const cleanFilter = filterUser.toLowerCase();
        const filtered = (data || []).filter(log => 
          log.username?.toLowerCase().includes(cleanFilter) || 
          log.user_id?.toLowerCase().includes(cleanFilter)
        );
        setAuditLogs(filtered);
      } else {
        setAuditLogs(data || []);
      }
    } catch (err) {
      console.error("Error executing backend audit trail lookups:", err.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setAdminStatus({ text: '', type: '' });
    const cleanEmail = newEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setAdminStatus({ text: '❌ Please fill out all configuration fields.', type: 'ERROR' });
      return;
    }

    try {
      setProcessing(true);

      const exists = await localDb.users.where('email').equalsIgnoreCase(cleanEmail).first();
      if (exists) {
        setAdminStatus({ text: '❌ Conflict: An operator account with this email already exists.', type: 'ERROR' });
        setProcessing(false);
        return;
      }

      if (newRole === 'SUPER_ADMIN') {
        const superAdminCount = await localDb.users.where('role').equals('SUPER_ADMIN').count();
        if (superAdminCount >= 2) {
          setAdminStatus({ 
            text: '❌ Security Allocation Limit: This healthcare facility has already reached its maximum capacity of 2 SuperAdmins.', 
            type: 'ERROR' 
          });
          setProcessing(false);
          return;
        }
      }

      let verifiedFacilityId = currentFacilityId;
      try {
        const currentActiveUser = await localDb.users.where('role').equals('SUPER_ADMIN').first();
        if (currentActiveUser?.facility_id) {
          verifiedFacilityId = currentActiveUser.facility_id;
        }
      } catch (facFindErr) {
        console.warn("Could not isolate parent facility profile linkage key:", facFindErr);
      }

      const preAuthorizedUserNode = {
        user_id: crypto.randomUUID(), 
        email: cleanEmail,
        password: '', 
        role: newRole, 
        facility_id: verifiedFacilityId,
        created_at: new Date().toISOString()
      };

      let cloudSyncedSuccessfully = true;
      try {
        const { error: cloudDbErr } = await supabaseLive
          .from('users')
          .insert([preAuthorizedUserNode]);

        if (cloudDbErr) throw cloudDbErr;
      } catch (cloudDbErr) {
        console.warn("Public users table cloud sync tracking rejected. Saving locally...", cloudDbErr);
        cloudSyncedSuccessfully = false;
      }

      await localDb.users.add(preAuthorizedUserNode);

      setAdminStatus({ 
        text: cloudSyncedSuccessfully 
          ? `🎉 Pre-Authorization Node Deployed! ${cleanEmail} is now authorized to register. Inform the staff member to complete registration using this exact email.`
          : `⚠️ Node Provisioned Locally (Cloud Offline/Rate Limited)! ${cleanEmail} added to local cache registry. Staff member can claim account immediately.`,
        type: 'SUCCESS' 
      });
      
      setNewEmail('');
      refreshAdminDashboardCore();
    } catch (err) {
      console.error("Staff Node Deployment Exception:", err);
      setAdminStatus({ text: `❌ Relational Provisioning Failure: ${err.message}`, type: 'ERROR' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail, userRole) => {
    if (userRole === 'SUPER_ADMIN') {
      setAdminStatus({ text: '❌ Security Lockout: Root institutional SuperAdmin identities are completely immutable and cannot be deleted.', type: 'ERROR' });
      return;
    }

    if (!window.confirm(`⚠️ CRITICAL DELETION NOTICE: Are you absolutely sure you want to permanently DELETE the system credentials for: ${userEmail} from both local storage and the cloud server?`)) {
      return;
    }

    try {
      const { error: cloudError } = await supabaseLive
        .from('users')
        .delete()
        .eq('user_id', userId);

      if (cloudError) throw cloudError;

      await localDb.users.delete(userId);
      setAdminStatus({ text: '🎉 Staff account wiped cleanly from local cache and Supabase cloud infrastructure channels.', type: 'SUCCESS' });
      refreshAdminDashboardCore();
    } catch (err) {
      console.error("Boundary Deletion Error:", err);
      setAdminStatus({ text: `❌ Error executing database table deletion loop: ${err.message}`, type: 'ERROR' });
    }
  };

  const handleRequestFacilityDeletion = async () => {
    if (!window.confirm("🚨 Are you absolutely certain you want to schedule this complete healthcare facility for deletion? This will instantly wipe all patient files from this machine and trigger a 21-day destruction countdown in the cloud database layers.")) {
      return;
    }

    try {
      const destructionDate = new Date();
      destructionDate.setDate(destructionDate.getDate() + 21);
      
      //  FIXED: Retrieve the active logged-in email directly from localStorage session parsing
      let activeSessionEmail = "";
      let resolvedId = null;
      
      try {
        const cachedUsers = await localDb.users.toArray();
        const storageKeys = ['user', 'session', 'active_user', 'supabase.auth.token'];
        
        for (const key of storageKeys) {
          const rawItem = localStorage.getItem(key);
          if (rawItem) {
            try {
              const parsed = JSON.parse(rawItem);
              const emailCandidate = parsed.currentSession?.user?.email || parsed.user?.email || parsed.email;
              if (emailCandidate) {
                activeSessionEmail = emailCandidate.trim().toLowerCase();
                break;
              }
            } catch {
              if (typeof rawItem === 'string' && rawItem.includes('@')) {
                activeSessionEmail = rawItem.trim().toLowerCase();
                break;
              }
            }
          }
        }

        if (activeSessionEmail) {
          const activeUserRecord = cachedUsers.find(u => u.email.trim().toLowerCase() === activeSessionEmail);
          resolvedId = activeUserRecord?.facility_id;
        }
      } catch (e) {
        console.warn("Could not isolate active facility ID or active email for targeted deletion:", e);
      }

      // Fallback in case local session parsing failed to find the active user
      if (!activeSessionEmail) {
        const fallbackUser = await localDb.users.where('role').equals('SUPER_ADMIN').first();
        activeSessionEmail = fallbackUser?.email || "unknown_admin@gmail.com";
        resolvedId = resolvedId || fallbackUser?.facility_id;
      }

      // 🔒 Strict safety gate: enforce the matching facility constraint check and stamp the active email
      if (supabaseLive && resolvedId) {
        const { error } = await supabaseLive
          .from('facilities')
          .update({
            status: 'PENDING_PURGE',
            purge_target_at: destructionDate.toISOString(),
            requested_by: activeSessionEmail // 🌟 FIXED: Writes the exact session email instead of Dexie's first match
          })
          .eq('facility_id', resolvedId); 

        if (error) throw error;
      }

      await localDb.visit.clear();
      await localDb.complaint.clear();
      await localDb.vitals.clear();
      await localDb.examination.clear();
      await localDb.medication_dispensed.clear();
      await localDb.patients.clear();
      await localDb.sync_outbox.clear();

      alert(" Facility Destruction Initialized Successfully!\nLocal client caches cleared. The cloud server will fully purge all backup metrics in 21 days unless manually aborted by a SuperAdmin.");
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      setAdminStatus({ text: `❌ Deletion Pipeline Execution Failure: ${err.message}`, type: 'ERROR' });
    }
  };

  const handleWipeDatabaseCache = async () => {
    if (!window.confirm(" WARNING: You are initializing a destructive local storage database wipe. Proceed?")) return;
    try {
      await localDb.visit.clear();
      await localDb.complaint.clear();
      await localDb.vitals.clear();
      await localDb.examination.clear();
      await localDb.medication_dispensed.clear();
      await localDb.sync_outbox.clear();
      await localDb.patients.clear(); 
      
      setAdminStatus({ text: 'Cache Cleared! Local client 3NF tables completely flushed.', type: 'SUCCESS' });
      refreshAdminDashboardCore();
    } catch (err) { 
      setAdminStatus({ text: ' Failure dropping database blocks.', type: 'ERROR' }); 
    }
  };

  const statusBanner = adminStatus.type === 'SUCCESS' 
    ? { bg: '#e6f4ea', text: '#137333', border: '#10b981' } 
    : { bg: '#fce8e6', text: '#c5221f', border: '#dc2626' };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '28px', 
      fontFamily: '"Montserrat", "Segoe UI", sans-serif',
      background: '#f8fafc',
      padding: '12px'
    }}>
      <style>{`
        .panel-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
          padding: 24px;
        }
        .form-input {
          width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #cbd5e1;
          font-size: 13px; font-weight: 500; font-family: "Montserrat", sans-serif;
          background: #ffffff; box-sizing: border-box; transition: all 0.2s ease;
        }
        .form-input:focus {
          border-color: #004bf6 !important; box-shadow: 0 0 0 4px rgba(0, 75, 246, 0.08) !important; outline: none;
        }
        .input-label { display: block; font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px; }
        .primary-btn {
          width: 100%; padding: 14px; background: #004bf6; color: white; border: none; border-radius: 10px;
          font-weight: 700; font-size: 13px; font-family: "Montserrat", sans-serif; cursor: pointer; transition: background 0.2s ease;
        }
        .primary-btn:hover { background: #003cd1; }
        .tab-btn {
          padding: 10px 16px; border-radius: 10px; border: none; font-weight: 700; font-size: 13px;
          font-family: "Montserrat", sans-serif; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease;
        }
        .badge-container { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        
        /* 📱 RESPONSIVE LAYOUT MATRIX */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.1fr 1.4fr;
          gap: 24px;
        }

        /* 📟 Screen sizes smaller than 1024px (Tablets & Landscape Mobile) */
        @media (max-width: 1024px) {
          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }

        /* 📱 Screen sizes smaller than 640px (Portrait Mobile Devices) */
        @media (max-width: 640px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      
      {/* 🌟 DYNAMIC HEADER BLOCK INTEGRATION (Table 3.10 Layout Mapping) */}
      <div>
        <h2 style={{ color: '#0f172a', margin: '0 0 4px 0', fontSize: '26px', fontWeight: '800', letterSpacing: '-0.75px' }}>
          {facilityName} Management Panel
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, fontWeight: '600' }}>
          📍 Clinic Location Node: <span style={{ color: '#004bf6' }}>{facilityLocation}</span> | Active 3NF Relational Operational Ledger
        </p>
      </div>

      {/* 🌟 METRIC MATRIX ROW (RESPONSIVE CONFIGURATION ENABLED) */}
      <div className="metrics-grid">
        
        {/* TOTAL PATIENTS METRIC CARD */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="badge-container" style={{ background: 'rgba(0, 75, 246, 0.06)', color: '#004bf6' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <strong style={{ fontSize: '32px', color: '#0f172a', fontWeight: '800', display: 'block', lineHeight: '1' }}>{cachedProfilesCount}</strong>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '6px' }}>Total Patients</span>
          </div>
        </div>

        {/* TOTAL RECORDS METRIC CARD */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="badge-container" style={{ background: '#e6f4ea', color: '#137333' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div>
            <strong style={{ fontSize: '32px', color: '#0f172a', fontWeight: '800', display: 'block', lineHeight: '1' }}>{encounterLogsCount}</strong>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '6px' }}>Total Records</span>
          </div>
        </div>

        {/* PENDING SYNC METRIC CARD */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="badge-container" style={{ background: '#fdf2e9', color: '#b06000' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <strong style={{ fontSize: '32px', color: outboxCount > 0 ? '#dc2626' : '#0f172a', fontWeight: '800', display: 'block', lineHeight: '1' }}>{outboxCount}</strong>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '6px' }}>Pending Sync</span>
          </div>
        </div>

        {/* HEALTH ARCHITECTURE ENGINE STATUS CARD */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="badge-container" style={{ background: '#e6f4ea', color: '#137333' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <div>
            <strong style={{ fontSize: '16px', color: '#137333', fontWeight: '800', display: 'block', marginTop: '4px' }}>Online Provider</strong>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginTop: '6px' }}>System Engine</span>
          </div>
        </div>

      </div>

      {/* DYNAMIC SYSTEM ALERT NOTIFICATIONS */}
      {adminStatus.text && (
        <div style={{ padding: '14px 16px', background: statusBanner.bg, color: statusBanner.text, border: `1px solid ${statusBanner.border}`, borderRadius: '12px', fontSize: '13px', fontWeight: '600', lineHeight: '1.4' }}>
          {adminStatus.text}
        </div>
      )}

{/* 🌟 INTERACTION MATRIX DIV IN ADMINDASHBOARD.JSX AND UPDATE IT */}
<div className="dashboard-grid" style={{
  display: 'grid',
  gridTemplateColumns: window.innerWidth <= 1024 ? '1fr' : '1.1fr 1.4fr',
  gap: '24px'
}}>
        
        {/* LEFT COLUMN: STAFF CONTROL CENTER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* USER CREATION BLOCK */}
          <div className="panel-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Provision System Staff Account
            </h3>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-input-label input-label">Staff Operator Email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="operator@gmail.com" className="form-input" required disabled={processing} />
              </div>
              <div>
                <label className="form-input-label input-label">Privilege Security Level</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="form-input" disabled={processing} style={{ cursor: 'pointer' }}>
                  <option value="NURSE">NURSE VIEW (Clinical Entry)</option>
                  <option value="ADMIN">ADMIN VIEW (Data Operator)</option>
                  <option value="SUPER_ADMIN">SUPER ADMIN VIEW (Master Privilege)</option>
                </select>
              </div>
              <button type="submit" className="primary-btn" disabled={processing} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8" cy="7" r="4" />
                </svg>
                {processing ? 'Authorizing Slot...' : 'Deploy Staff Account Node'}
              </button>
            </form>
          </div>

          {/* ACTIVE STAFF REGISTRY BLOCK */}
          <div className="panel-card">
            <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active System Operators Registry
            </h3>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700' }}>Operator Email</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {systemUsers.map((user) => {
                    const isTrueSuperAdmin = user.role === 'SUPER_ADMIN';
                    return (
                      <tr key={user.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: '600', color: '#0f172a' }}>
                          {user.email}
                          <span style={{ display: 'block', fontSize: '10px', color: '#64748b', marginTop: '3px', fontWeight: '700' }}>{user.role}</span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {isTrueSuperAdmin ? (
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', padding: '4px 8px', background: '#f1f5f9', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                               🔒 Root
                            </span>
                          ) : (
                            <button 
                              onClick={() => handleDeleteUser(user.user_id, user.email, user.role)} 
                              style={{ padding: '6px 12px', background: '#ffffff', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s ease' }}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* EMERGENCY CRYPTOGRAPHIC VAULT PURGE ROUTINES */}
          <div className="panel-card" style={{ background: '#fff1f2', border: '1px solid #ffe4e6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ margin: '0', color: '#991b1b', fontSize: '13px', fontWeight: '800', letterSpacing: '0.25px' }}>⚠️ SYSTEM DESTRUCTION VAULT</h4>
            <p style={{ margin: '0', fontSize: '12px', color: '#9f1239', lineHeight: '1.5', fontWeight: '500' }}>
              Wipe local database tables immediately or schedule this entire facility for a permanent 21-day network erasure.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <button onClick={handleWipeDatabaseCache} style={{ width: '100%', padding: '10px 14px', background: '#ffffff', border: '1px solid #dc2626', color: '#dc2626', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px', fontFamily: '"Montserrat", sans-serif' }}>
                 Wipe Local Database Cache
              </button>
              <button onClick={handleRequestFacilityDeletion} style={{ width: '100%', padding: '10px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px', fontFamily: '"Montserrat", sans-serif' }}>
                 Request Total Facility Deletion (21-Day Grace)
              </button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: CORE REGISTRY DATA PANELS */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* TAB ROUTING AND DATA CONTROL STRIPS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setActiveTab('patients')} 
                className="tab-btn"
                style={{ 
                  background: activeTab === 'patients' ? 'rgba(0, 75, 246, 0.06)' : '#f1f5f9', 
                  color: activeTab === 'patients' ? '#004bf6' : '#475569' 
                }}
              >
                Patients ({localPatients.length})
              </button>
              <button 
                onClick={() => setActiveTab('encounters')} 
                className="tab-btn"
                style={{ 
                  background: activeTab === 'encounters' ? 'rgba(0, 75, 246, 0.06)' : '#f1f5f9', 
                  color: activeTab === 'encounters' ? '#004bf6' : '#475569' 
                }}
              >
                Encounters ({localEncounters.length})
              </button>
              <button 
                onClick={() => setActiveTab('audit-logs')} 
                className="tab-btn"
                style={{ 
                  background: activeTab === 'audit-logs' ? 'rgba(0, 75, 246, 0.06)' : '#f1f5f9', 
                  color: activeTab === 'audit-logs' ? '#004bf6' : '#475569' 
                }}
              >
                  Security Logs
              </button>
              <button 
                onClick={() => setActiveTab('sync-outbox')} 
                className="tab-btn"
                style={{ 
                  background: activeTab === 'sync-outbox' ? 'rgba(0, 75, 246, 0.06)' : '#f1f5f9', 
                  color: activeTab === 'sync-outbox' ? '#004bf6' : '#475569' 
                }}
              >
                Pending Outbox ({outboxCount})
              </button>
            </div>
            <button onClick={refreshAdminDashboardCore} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#334155', cursor: 'pointer', fontFamily: '"Montserrat", sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Refresh
            </button>
          </div>

          {/* DATA CONTAINER: PATIENTS MATRIX REGISTRY */}
          {activeTab === 'patients' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>BARCODE ID</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>FULL NAME</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>GENDER</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>DOB</th>
                  </tr>
                </thead>
                <tbody>
                  {localPatients.length === 0 ? (
                    <tr><td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontWeight: '500' }}>No index patient configurations located inside local browser tables.</td></tr>
                  ) : (
                    localPatients.map((p) => (
                      <tr key={p.patient_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#004bf6' }}>{p.barcode_id}</td>
                        <td style={{ padding: '14px 16px', fontWeight: '600', color: '#0f172a' }}>{p.first_name} {p.last_name}</td>
                        <td style={{ padding: '14px 16px', color: '#334155', fontWeight: '500' }}>{p.gender}</td>
                        <td style={{ padding: '14px 16px', color: '#334155', fontWeight: '500' }}>{p.date_of_birth}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* DATA CONTAINER: MEDICAL ENCOUNTERS LOGS REGISTRY */}
          {activeTab === 'encounters' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>VISIT UUID</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>COMPLAINT / SYMPTOM</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>DIAGNOSIS NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {localEncounters.length === 0 ? (
                    <tr><td colSpan="3" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontWeight: '500' }}>No raw encounter log matrices located inside local device disk registries.</td></tr>
                  ) : (
                    localEncounters.map((v) => (
                      <tr key={v.visit_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#475569', fontWeight: '500' }}>{v.visit_id.substring(0, 8)}...</td>
                        <td style={{ padding: '14px 16px', fontWeight: '600', color: '#0f172a' }}>{v.presenting_complaint}</td>
                        <td style={{ padding: '14px 16px', fontStyle: 'italic', color: '#334155', fontWeight: '500' }}>{v.diagnosis_notes}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* --- INTEGRATED PIPELINE: SECURITY AUDIT LOG VIEW PANEL --- */}
          {activeTab === 'audit-logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  placeholder="Filter by operator username/ID..." 
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px', flex: 1 }}
                />
                <select 
                  value={filterAction} 
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px', width: 'auto', cursor: 'pointer' }}
                >
                  <option value="">All Action Vectors</option>
                  <option value="LOGIN">LOGIN</option>
                  <option value="CREATE">CREATE</option>
                  <option value="UPDATE">UPDATE</option>
                  <option value="SYNC">SYNC</option>
                </select>
              </div>

              {loadingAudit ? (
                <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', padding: '16px 0' }}>Querying structural secure infrastructure trail collections...</p>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '12px 14px', fontWeight: '700' }}>TIMESTAMP</th>
                        <th style={{ padding: '12px 14px', fontWeight: '700' }}>OPERATOR ID</th>
                        <th style={{ padding: '12px 14px', fontWeight: '700' }}>ACTION</th>
                        <th style={{ padding: '12px 14px', fontWeight: '700' }}>RESOURCE</th>
                        <th style={{ padding: '12px 14px', fontWeight: '700' }}>NETWORK IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length === 0 ? (
                        <tr><td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontWeight: '500' }}>No audit trail entries matching criteria located in Supabase tables.</td></tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr key={log.log_id || log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 14px', color: '#64748b' }}>{new Date(log.timestamp).toLocaleString()}</td>
                            <td style={{ padding: '12px 14px', fontWeight: '600', color: '#0f172a' }}>{log.username || log.user_id || 'System Process'}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                padding: '3px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                                backgroundColor: log.action === 'LOGIN' ? '#e0f2fe' : log.action === 'CREATE' ? '#dcfce7' : '#fef9c3',
                                color: log.action === 'LOGIN' ? '#0369a1' : log.action === 'CREATE' ? '#15803d' : '#a16207'
                              }}>
                                {log.action === 'LOGIN' ? 'Login' : 
                                 log.action === 'CREATE' ? 'Created Patient' : 
                                 log.action === 'UPDATE' ? 'Updated Record' : 
                                 log.action === 'SYNC' ? 'Synced Database' : log.action}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', color: '#334155', fontWeight: '500' }}>
                              {log.resource === 'Patient' ? 'Patient Record' : 
                               log.resource === 'Auth Module' ? 'Authentication Module' : log.resource}
                            </td>
                            <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#64748b' }}>{log.ip_address || '127.0.0.1'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* DATA CONTAINER: PENDING SYNC OUTBOX MATRIX QUEUE (Table 3.11 Compliance) */}
          {activeTab === 'sync-outbox' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>OUTBOX ID</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>TARGET TABLE</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>ACTION INTENT</th>
                    <th style={{ padding: '14px 16px', fontWeight: '700' }}>TIMESTAMP</th>
                  </tr>
                </thead>
                <tbody>
                  {localOutboxRows.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: '#137333', fontStyle: 'italic', fontWeight: '600', backgroundColor: '#e6f4ea' }}>
                         Outbox clear! Local cache is 100% synchronized with the permanent Supabase cloud schemas.
                      </td>
                    </tr>
                  ) : (
                    localOutboxRows.map((row) => (
                      <tr key={row.outbox_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#64748b' }}>{row.outbox_id.substring(0, 8)}...</td>
                        <td style={{ padding: '14px 16px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase' }}>{row.table_name}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ 
                            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', 
                            background: row.action === 'CREATE' ? '#dcfce7' : '#fef9c3', 
                            color: row.action === 'CREATE' ? '#15803d' : '#a16207' 
                          }}>
                            {row.action}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#475569' }}>{new Date(row.created_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}