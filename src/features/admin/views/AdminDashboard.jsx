import React, { useState, useEffect } from 'react';
import { localDb } from '../../../core/db/localDb';

// Direct path link module to talk to your permanent online Supabase database core
import { supabase } from '../../../core/supabase/client';
const supabaseLive = supabase;

// 🌟 CLEAN BADGE COMPONENT (NO DOTS)
const CardBadge = ({ children, bg }) => (
  <div style={{
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    marginBottom: '14px'
  }}>
    {children}
  </div>
);

// 👤 PATIENT USER OUTLINE ICON
const PatientUserIcon = ({ color = "#004bf6" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default function AdminDashboard() {
  // --- User Management State ---
  const [systemUsers, setSystemUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('NURSE');
  const [processing, setProcessing] = useState(false);
  
  // --- Diagnostics & Storage State ---
  const [cachedProfilesCount, setCachedProfilesCount] = useState(0);
  const [encounterLogsCount, setEncounterLogsCount] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);
  const [activeTab, setActiveTab] = useState('patients');
  const [localPatients, setLocalPatients] = useState([]);
  const [localEncounters, setLocalEncounters] = useState([]);
  const [localOutboxRows, setLocalOutboxRows] = useState([]); 

  // --- Periodic Analytical Breakdown States ---
  const [patientStats, setPatientStats] = useState({ today: 0, week: 0, month: 0, year: 0, total: 0, updated: 0 });
  const [visitStats, setVisitStats] = useState({ today: 0, week: 0, month: 0, total: 0 });
  
  // --- Facility Dynamic Tenant State ---
  const [facilityName, setFacilityName] = useState('Loading Clinic...');
  const [facilityLocation, setFacilityLocation] = useState('Syncing Node Address...');

  // --- Security Audit Log State ---
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const [adminStatus, setAdminStatus] = useState({ text: '', type: '' });

  const currentFacilityId = '00000000-0000-0000-0000-000000000000';

  useEffect(() => {
    refreshAdminDashboardCore();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit-logs') {
      fetchLiveAuditLogs();
    }
  }, [activeTab, filterUser, filterAction]);

  const refreshAdminDashboardCore = async () => {
    try {
      let resolvedName = "Futminna Healthcare";
      let resolvedLocation = "Minna, Niger State, Nigeria";
      let resolvedId = currentFacilityId;

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

        if (activeUserRecord && activeUserRecord.facility_id) {
          resolvedId = activeUserRecord.facility_id;
          const matchedFacility = await localDb.facilities.get(activeUserRecord.facility_id);
          if (matchedFacility) {
            resolvedName = matchedFacility.facility_name || resolvedName;
            resolvedLocation = matchedFacility.location || matchedFacility.facility_location || resolvedLocation;
          }
        }
      } catch (localDbErr) {
        console.warn("Could not query local IndexedDB facilities profile:", localDbErr);
      }

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

      // --- 🌐 CLOUD FALLBACK HYDRATION FOR PATIENTS & CLINICAL VISITS ---
      if (supabaseLive && resolvedId) {
        try {
          // 1. Fetch Patients from Supabase
          const { data: cloudPatients } = await supabaseLive
            .from('patients')
            .select('*')
            .eq('facility_id', resolvedId);

          if (cloudPatients && cloudPatients.length > 0) {
            for (const cp of cloudPatients) {
              await localDb.patients.put(cp);
            }
          }

          // 2. Fetch Visits from Supabase
          const { data: cloudVisits } = await supabaseLive
            .from('visit')
            .select('*');

          if (cloudVisits && cloudVisits.length > 0) {
            const visitIds = cloudVisits.map(v => v.visit_id);

            const [vitalsRes, complaintsRes, examRes, medsRes] = await Promise.all([
              supabaseLive.from('vitals').select('*').in('visit_id', visitIds),
              supabaseLive.from('complaint').select('*').in('visit_id', visitIds),
              supabaseLive.from('examination').select('*').in('visit_id', visitIds),
              supabaseLive.from('medication_dispensed').select('*').in('visit_id', visitIds)
            ]);

            for (const v of cloudVisits) await localDb.visit.put(v);
            if (vitalsRes.data) for (const vit of vitalsRes.data) await localDb.vitals.put(vit);
            if (complaintsRes.data) for (const cmp of complaintsRes.data) await localDb.complaint.put(cmp);
            if (examRes.data) for (const ex of examRes.data) await localDb.examination.put(ex);
            if (medsRes.data) for (const med of medsRes.data) await localDb.medication_dispensed.put(med);
          }
        } catch (cloudSyncErr) {
          console.warn("Cloud fallback hydration bypassed:", cloudSyncErr);
        }
      }

      // --- HYDRATE METRICS FROM LOCAL DB (NOW FULLY SYNCHRONIZED) ---
      const allPatientsArray = await localDb.patients.toArray();
      const patientsArray = allPatientsArray.filter(p => p.facility_id === resolvedId);
      setCachedProfilesCount(patientsArray.length);

      const rawVisitsArray = await localDb.visit.toArray();
      setEncounterLogsCount(rawVisitsArray.length);

      const pendingSyncCount = await localDb.sync_outbox.where('synced').equals(0).count();
      setOutboxCount(pendingSyncCount);

      const outboxArray = await localDb.sync_outbox.where('synced').equals(0).toArray();
      setLocalOutboxRows(outboxArray);

      // --- DATE RANGE STATS CALCULATIONS ---
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      let pToday = 0, pWeek = 0, pMonth = 0, pYear = 0, pUpdated = 0;
      patientsArray.forEach(p => {
        const createdDate = p.created_at ? new Date(p.created_at) : null;
        if (createdDate) {
          if (p.created_at.startsWith(todayStr)) pToday++;
          if (createdDate >= startOfWeek) pWeek++;
          if (createdDate >= startOfMonth) pMonth++;
          if (createdDate >= startOfYear) pYear++;
        }
        if (p.updated_at && p.created_at && p.updated_at !== p.created_at) {
          pUpdated++;
        }
      });

      setPatientStats({
        today: pToday,
        week: pWeek,
        month: pMonth,
        year: pYear,
        total: patientsArray.length,
        updated: pUpdated
      });

      let vToday = 0, vWeek = 0, vMonth = 0;
      rawVisitsArray.forEach(v => {
        const visitDateStr = v.visit_date || v.created_at;
        const vDate = visitDateStr ? new Date(visitDateStr) : null;

        if (visitDateStr && visitDateStr.startsWith(todayStr)) vToday++;
        if (vDate && vDate >= startOfWeek) vWeek++;
        if (vDate && vDate >= startOfMonth) vMonth++;
      });

      setVisitStats({
        today: vToday,
        week: vWeek,
        month: vMonth,
        total: rawVisitsArray.length
      });

      const compiledEncountersArray = await Promise.all(
        rawVisitsArray.map(async (v) => {
          const complaintRow = await localDb.complaint.where('visit_id').equals(v.visit_id).first();
          const examinationRow = await localDb.examination.where('visit_id').equals(v.visit_id).first();
          return {
            ...v,
            presenting_complaint: complaintRow?.symptom || 'General Consultation',
            diagnosis_notes: examinationRow?.diagnosis_notes || 'Review'
          };
        })
      );
      
      setLocalPatients(patientsArray);
      setLocalEncounters(compiledEncountersArray);

// ✅ AFTER (Fetches from Supabase first, then falls back to LocalDB)
let activeStaffList = [];

if (supabaseLive && resolvedId) {
  try {
    const { data: cloudUsers, error: staffErr } = await supabaseLive
      .from('users')
      .select('*')
      .eq('facility_id', resolvedId);

    if (!staffErr && cloudUsers && cloudUsers.length > 0) {
      // Save/update cloud staff into local IndexedDB for offline access
      for (const u of cloudUsers) {
        await localDb.users.put(u);
      }
      activeStaffList = cloudUsers;
    }
  } catch (netErr) {
    console.warn("Could not fetch live staff list from cloud:", netErr);
  }
}

// Fallback to local cache if offline or cloud returned nothing
if (activeStaffList.length === 0) {
  const allUsers = await localDb.users.toArray();
  activeStaffList = allUsers.filter(user => user.facility_id === resolvedId);
}

setSystemUsers(activeStaffList);
      
    } catch (err) {
      console.error("Critical error hydrating administrative database collections:", err);
    }
  };

  const fetchLiveAuditLogs = async () => {
    try {
      setLoadingAudit(true);
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

      const localStaff = await localDb.users.toArray();
      const tenantStaffIds = localStaff
        .filter(u => u.facility_id === resolvedId)
        .map(u => u.user_id);

      if (tenantStaffIds.length === 0) {
        setAuditLogs([]);
        setLoadingAudit(false);
        return;
      }

      let query = supabaseLive
        .from('audit_log')
        .select('*')
        .in('user_id', tenantStaffIds)
        .order('timestamp', { ascending: false });

      if (filterAction) {
        query = query.eq('action', filterAction);
      }

      const { data, error } = await query;
      if (error) throw error;

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
          ? `🎉 Pre-Authorization Node Deployed! ${cleanEmail} is now authorized to register.`
          : `⚠️ Node Provisioned Locally! ${cleanEmail} added to local cache registry.`,
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
      setAdminStatus({ text: '❌ Security Lockout: Root institutional SuperAdmin identities are completely immutable.', type: 'ERROR' });
      return;
    }

    if (!window.confirm(`⚠️ CRITICAL DELETION NOTICE: Are you sure you want to delete ${userEmail}?`)) {
      return;
    }

    try {
      const { error: cloudError } = await supabaseLive
        .from('users')
        .delete()
        .eq('user_id', userId);

      if (cloudError) throw cloudError;

      await localDb.users.delete(userId);
      setAdminStatus({ text: '🎉 Staff account wiped cleanly.', type: 'SUCCESS' });
      refreshAdminDashboardCore();
    } catch (err) {
      console.error("Boundary Deletion Error:", err);
      setAdminStatus({ text: `❌ Error executing deletion loop: ${err.message}`, type: 'ERROR' });
    }
  };

  const handleRequestFacilityDeletion = async () => {
    if (!window.confirm("🚨 Are you absolutely certain you want to schedule this complete facility for deletion?")) {
      return;
    }

    try {
      const destructionDate = new Date();
      destructionDate.setDate(destructionDate.getDate() + 21);
      
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
        console.warn("Could not isolate active facility ID or email:", e);
      }

      if (!activeSessionEmail) {
        const fallbackUser = await localDb.users.where('role').equals('SUPER_ADMIN').first();
        activeSessionEmail = fallbackUser?.email || "unknown_admin@gmail.com";
        resolvedId = resolvedId || fallbackUser?.facility_id;
      }

      if (supabaseLive && resolvedId) {
        const { error } = await supabaseLive
          .from('facilities')
          .update({
            status: 'PENDING_PURGE',
            purge_target_at: destructionDate.toISOString(),
            requested_by: activeSessionEmail
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

      alert("Facility Destruction Initialized Successfully!");
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      setAdminStatus({ text: `❌ Deletion Pipeline Execution Failure: ${err.message}`, type: 'ERROR' });
    }
  };

  const handleWipeDatabaseCache = async () => {
    if (!window.confirm("WARNING: You are initializing a destructive local storage database wipe. Proceed?")) return;
    try {
      await localDb.visit.clear();
      await localDb.complaint.clear();
      await localDb.vitals.clear();
      await localDb.examination.clear();
      await localDb.medication_dispensed.clear();
      await localDb.sync_outbox.clear();
      await localDb.patients.clear(); 
      
      setAdminStatus({ text: 'Cache Cleared! Local client tables completely flushed.', type: 'SUCCESS' });
      refreshAdminDashboardCore();
    } catch (err) { 
      setAdminStatus({ text: 'Failure dropping database blocks.', type: 'ERROR' }); 
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
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
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
        .section-title { font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 8px 0 16px 0; display: flex; alignItems: center; gap: 8px; }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .metrics-grid-5 {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.1fr 1.4fr;
          gap: 24px;
        }

        @media (max-width: 1280px) {
          .metrics-grid-5 { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 1024px) {
          .metrics-grid { grid-template-columns: repeat(2, 1fr); }
          .metrics-grid-5 { grid-template-columns: repeat(2, 1fr); }
          .dashboard-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 640px) {
          .metrics-grid, .metrics-grid-5 { grid-template-columns: 1fr; }
        }
      `}</style>
      
      {/* 🌟 DYNAMIC HEADER BLOCK */}
      <div>
        <h2 style={{ color: '#0f172a', margin: '0 0 4px 0', fontSize: '26px', fontWeight: '800', letterSpacing: '-0.75px' }}>
          {facilityName} Management Panel
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, fontWeight: '600' }}>
          📍 Clinic Location Node: <span style={{ color: '#004bf6' }}>{facilityLocation}</span>
        </p>
      </div>

      {/* --- SECTION 1: SYSTEM OVERVIEW ROW --- */}
      <div className="metrics-grid">
        
        {/* Card 1: Total Patients */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
          <CardBadge bg="#eff6ff">
            <PatientUserIcon color="#004bf6" />
          </CardBadge>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{cachedProfilesCount}</h2>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TOTAL PATIENTS</span>
          </div>
        </div>

        {/* Card 2: Total Records */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
          <CardBadge bg="#e6f4ea">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </CardBadge>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{encounterLogsCount}</h2>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TOTAL RECORDS</span>
          </div>
        </div>

        {/* Card 3: Pending Sync */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
          <CardBadge bg={outboxCount > 0 ? '#fffbeb' : '#e6f4ea'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={outboxCount > 0 ? '#d97706' : '#10b981'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </CardBadge>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{outboxCount}</h2>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PENDING SYNC</span>
          </div>
        </div>

        {/* Card 4: System Engine */}
        <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
          <CardBadge bg="#e6f4ea">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
            </svg>
          </CardBadge>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#10b981', margin: '0 0 4px 0', lineHeight: '1' }}>Online Provider</h2>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SYSTEM ENGINE</span>
          </div>
        </div>
      </div>

      {/* --- SECTION 2: PATIENT REGISTRATION BREAKDOWN --- */}
      <div>
        <h3 className="section-title"><span>👥</span> PATIENT REGISTRATION BREAKDOWN</h3>
        <div className="metrics-grid-5">
          
          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#eff6ff">
              <PatientUserIcon color="#004bf6" />
            </CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{patientStats.today}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>REGISTERED TODAY</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#eff6ff">
              <PatientUserIcon color="#004bf6" />
            </CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{patientStats.week}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>REGISTERED THIS WEEK</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#eff6ff">
              <PatientUserIcon color="#004bf6" />
            </CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{patientStats.month}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>REGISTERED THIS MONTH</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#eff6ff">
              <PatientUserIcon color="#004bf6" />
            </CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{patientStats.year}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>REGISTERED THIS YEAR</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#eff6ff">
              <PatientUserIcon color="#004bf6" />
            </CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{patientStats.updated}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PROFILES UPDATED</span>
            </div>
          </div>

        </div>
      </div>

      {/* --- SECTION 3: CLINICAL ENCOUNTERS BREAKDOWN --- */}
      <div>
        <h3 className="section-title"><span>🩺</span> CLINICAL ENCOUNTERS BREAKDOWN</h3>
        <div className="metrics-grid">
          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#f0fdf4">🩺</CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{visitStats.today}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>VISITS TODAY</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#f0fdf4">📊</CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{visitStats.week}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>VISITS THIS WEEK</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#f0fdf4">🗓️</CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{visitStats.month}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>VISITS THIS MONTH</span>
            </div>
          </div>

          <div className="panel-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}>
            <CardBadge bg="#faf5ff">📚</CardBadge>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0', lineHeight: '1' }}>{visitStats.total}</h2>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TOTAL ENCOUNTERS (ANNUAL)</span>
            </div>
          </div>
        </div>
      </div>

      {/* DYNAMIC SYSTEM ALERT NOTIFICATIONS */}
      {adminStatus.text && (
        <div style={{ padding: '14px 16px', background: statusBanner.bg, color: statusBanner.text, border: `1px solid ${statusBanner.border}`, borderRadius: '12px', fontSize: '13px', fontWeight: '600', lineHeight: '1.4' }}>
          {adminStatus.text}
        </div>
      )}

      {/* --- DASHBOARD SPLIT WORKSPACE GRID --- */}
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

          {/* EMERGENCY PURGE */}
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
                <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', padding: '16px 0' }}>Querying audit trails...</p>
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
                        <tr><td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontWeight: '500' }}>No audit trail entries matching criteria located.</td></tr>
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
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#64748b' }}>{String(row.outbox_id).substring(0, 8)}...</td>
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