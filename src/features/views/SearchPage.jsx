import React, { useState, useEffect } from 'react';
import { localDb } from '../../core/db/localDb';
import NewVisitWizard from "../visit/components/NewVisitWizard";
import { processSyncOutbox } from '../../core/sync/syncEngine';
import { logSecurityEvent } from '../../core/supabase/client';

// Direct path mapping to your exact file location inside the supabase folder sub-node
import { supabase } from '../../core/supabase/client';
const supabaseLive = supabase;

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [lastVisitCache, setLastVisitCache] = useState(null); // 🧠 Emergency Horizon 1 Anchor (Assembled 3NF Object)
  const [lastMonthCache, setLastMonthCache] = useState([]);   // 🧠 Emergency Horizon 2 Anchor (Assembled 3NF Array)
  const [globalHistory, setGlobalHistory] = useState([]);     // ☁️ Horizon 3 Print Matrix (Assembled 3NF Array)
  const [status, setStatus] = useState({ text: '', type: '' });
  const [searching, setSearching] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // --- NEW STATE FOR ADDED FEATURES ---
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', relationship_status: '', phone: '', address: '' });
  const [viewingFullRecords, setViewingFullRecords] = useState(false);
  const [patientFullHistoryList, setPatientFullHistoryList] = useState([]);

  // --- 🌟 NEW: Facility Tenant Print State (Table 3.10 Compliance) ---
  const [printFacilityName, setPrintFacilityName] = useState('RURALHEALTH');

  // --- 🌟 NEW: Hook to Fetch Clinic Name for Printed Assets dynamically ---
  useEffect(() => {
    const fetchClinicNameForPrint = async () => {
      // Isolate current user context to query the explicit matching clinic name row
      let resolvedId = null;
      try {
        const cachedUsers = await localDb.users.toArray();
        const rawSession = localStorage.getItem('user') || localStorage.getItem('session') || localStorage.getItem('active_session_user') || '{}';
        let activeEmail = '';
        try {
          const parsed = JSON.parse(rawSession);
          const userObj = parsed.currentSession?.user || parsed.user || parsed;
          if (userObj?.email) activeEmail = userObj.email;
        } catch {
          if (typeof rawSession === 'string' && rawSession.includes('@')) activeEmail = rawSession;
        }
        
        const activeUserRecord = cachedUsers.find(u => u.email.trim().toLowerCase() === String(activeEmail || '').trim().toLowerCase());
        resolvedId = activeUserRecord?.facility_id || cachedUsers[cachedUsers.length - 1]?.facility_id;
        
        if (resolvedId) {
          const matchedFacility = await localDb.facilities.get(resolvedId);
          if (matchedFacility?.facility_name) {
            setPrintFacilityName(matchedFacility.facility_name.toUpperCase());
            return;
          }
        }
      } catch (e) { console.warn(e); }

      if (supabaseLive) {
        try {
          let query = supabaseLive.from('facilities').select('facility_name');
          if (resolvedId) {
            query = query.eq('facility_id', resolvedId);
          }
          const { data: facilitiesList, error: facError } = await query.limit(1);

          if (!facError && facilitiesList && facilitiesList.length > 0) {
            setPrintFacilityName(facilitiesList[0].facility_name.toUpperCase());
          } else {
            setPrintFacilityName('FUTMINNA HEALTHCARE');
          }
        } catch (err) {
          console.warn("Operating offline. Print templates using default fallback headers.", err);
          setPrintFacilityName('FUTMINNA HEALTHCARE');
        }
      }
    };

    fetchClinicNameForPrint();
  }, [selectedPatient]);

  const getStatusTheme = () => {
    switch (status.type) {
      case 'SUCCESS': return { bg: '#e6f4ea', text: '#137333', border: '#10b981', leftBorder: '#10b981' };
      case 'PENDING': return { bg: '#f0f4ff', text: '#004bf6', border: '#cbd5e1', leftBorder: '#004bf6' };
      case 'EMPTY': return { bg: '#fffbeb', text: '#92400e', border: '#fef3c7', leftBorder: '#f59e0b' };
      case 'ERROR': return { bg: '#fce8e6', text: '#c5221f', border: '#dc2626', leftBorder: '#dc2626' };
      default: return { bg: '#f8fafc', text: '#475569', border: '#e2e8f0', leftBorder: '#004bf6' };
    }
  };

  const compile3NFVisitRecord = async (visitRow) => {
    const [vitalsData, complaintData, medData] = await Promise.all([
      localDb.vitals.where('visit_id').equals(visitRow.visit_id).first(),
      localDb.complaint.where('visit_id').equals(visitRow.visit_id).first(),
      localDb.medication_dispensed.where('visit_id').equals(visitRow.visit_id).first()
    ]);

    return {
      ...visitRow,
      temperature_celsius: vitalsData?.temperature || 'N/A',
      blood_pressure: vitalsData?.blood_pressure || 'N/A', 
      weight_kg: vitalsData?.weight || 'N/A',
      heart_rate: vitalsData?.heart_rate || 'N/A',
      respiratory_rate: 'N/A', 
      presenting_complaint: complaintData?.symptom || 'General Consultation',
      duration_days: complaintData?.duration || 'N/A',
      diagnosis_notes: complaintData?.diagnosis_notes || 'Review',
      treatment_plan: medData 
        ? `${medData.drug_name} (${medData.dosage || ''} - ${medData.frequency || ''} for ${medData.duration || ''})`
        : 'None Prescribed'
    };
  };

  // =========================================================================
  // 🔍 TENANT-ISOLATED CORE RETRIEVAL SEARCH LOOP
  // =========================================================================
  const handleSearch = async (e) => {
    e.preventDefault();
    setStatus({ text: '', type: '' });
    setSelectedPatient(null);
    setLastVisitCache(null);
    setLastMonthCache([]);
    setGlobalHistory([]);
    setViewingFullRecords(false);
    
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery) {
      setSearchResults([]);
      setStatus({ text: '⚠️ Please input a patient tracking sequence or run a barcode card scan.', type: 'INFO' });
      return;
    }

    setSearching(true);
    try {
      // 🌟 Isolate the current user session context to locate the active facility_id
      let activeFacilityId = null;
      try {
        const cachedUsers = await localDb.users.toArray();
        const rawSession = localStorage.getItem('user') || localStorage.getItem('session') || localStorage.getItem('active_session_user') || '{}';
        let activeEmail = '';
        
        try {
          const parsed = JSON.parse(rawSession);
          const userObj = parsed.currentSession?.user || parsed.user || parsed;
          if (userObj?.email) activeEmail = userObj.email;
        } catch {
          if (typeof rawSession === 'string' && rawSession.includes('@')) activeEmail = rawSession;
        }

        let activeUserRecord = null;
        if (activeEmail) {
          activeUserRecord = cachedUsers.find(u => u.email.trim().toLowerCase() === activeEmail.trim().toLowerCase());
        }

        activeFacilityId = activeUserRecord?.facility_id || cachedUsers[cachedUsers.length - 1]?.facility_id;
      } catch (sessionErr) {
        console.warn("Session isolation tracking bypassed:", sessionErr);
      }

      let records = [];

      if (cleanQuery.toUpperCase().startsWith('RURAL-')) {
        const match = await localDb.patients
          .where('barcode_id')
          .equalsIgnoreCase(cleanQuery)
          .first();
          
        if (match) {
          // 🔒 SECURITY GATE check: Intercept cross-clinic database views instantly
          if (match.facility_id && match.facility_id !== activeFacilityId) {
            setStatus({ text: '❌ Security Access Denied: This patient profile belongs to a separate healthcare node.', type: 'ERROR' });
            boxSearchResults([]);
            setSearching(false);
            return;
          }
          records = [match];
        }
      } else {
        const queryLower = cleanQuery.toLowerCase();
        const allPatients = await localDb.patients.toArray();
        
        // 🔒 SECURITY FILTER: Restrict text searches solely to current logged-in station data boundaries
        records = allPatients.filter(patient => 
          patient.facility_id === activeFacilityId && (
            patient.first_name.toLowerCase().includes(queryLower) ||
            patient.last_name.toLowerCase().includes(queryLower)
          )
        );
      }

      // Cloud Fallback Retrieval Gate
      if (records.length === 0 && cleanQuery.toUpperCase().startsWith('RURAL-') && supabaseLive) {
        setStatus({ text: '🔍 Cache Miss: Scanning permanent Supabase cloud infrastructure...', type: 'PENDING' });
        const targetBarcode = cleanQuery.toUpperCase().trim();
        
        const { data: cloudPatient, error: cloudErr } = await supabaseLive
          .from('patients')
          .select('*')
          .eq('barcode_id', targetBarcode)
          .maybeSingle();

        if (cloudPatient) {
          // 🔒 CLOUD PRIVACY CHECK: Verify retrieved data points don't point to external system indices
          if (cloudPatient.facility_id && cloudPatient.facility_id !== activeFacilityId) {
            setStatus({ text: '❌ Security Access Denied: This patient profile belongs to a separate healthcare node.', type: 'ERROR' });
            setSearchResults([]);
            setSearching(false);
            return;
          }

          await localDb.patients.put(cloudPatient);
          records = [cloudPatient];

          const [visitsRes, vitalsRes, complaintsRes, medsRes] = await Promise.all([
            supabaseLive.from('clinical_visits').select('*').eq('patient_id', cloudPatient.patient_id),
            supabaseLive.from('vitals').select('*'),
            supabaseLive.from('complaints').select('*'),
            supabaseLive.from('medications_dispensed').select('*')
          ]);

          if (!visitsRes.error && visitsRes.data) {
            for (const v of visitsRes.data) {
              await localDb.visit.put(v);
              if (vitalsRes.data) {
                const matchVitals = vitalsRes.data.find(item => item.visit_id === v.visit_id);
                if (matchVitals) await localDb.vitals.put(matchVitals);
              }
              if (complaintsRes.data) {
                const matchComplaint = complaintsRes.data.find(item => item.visit_id === v.visit_id);
                if (matchComplaint) await localDb.complaint.put(matchComplaint);
              }
              if (medsRes.data) {
                const matchMed = medsRes.data.find(item => item.visit_id === v.visit_id);
                if (matchMed) {
                  await localDb.medication_dispensed.put({
                    ...matchMed,
                    med_dispensed_id: matchMed.medication_id || matchMed.med_dispensed_id
                  });
                }
              }
            }
          }
        }
      }

      setSearchResults(records);

      if (records.length === 0) {
        setStatus({ text: 'ℹ️ No matching patient file located within local hardware disk registry or cloud infrastructure.', type: 'EMPTY' });
      } else if (records.length === 1) {
        handleSelectPatient(records[0]);
      } else {
        setStatus({ text: `🎉 Query resolved successfully. Located ${records.length} matching candidate profiles.`, type: 'SUCCESS' });
      }
    } catch (error) {
      console.error(error);
      setStatus({ text: '❌ Critical Error: Hardware read exception generated during dynamic array checks.', type: 'ERROR' });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setLastVisitCache(null);
    setLastMonthCache([]);
    setGlobalHistory([]);
    setViewingFullRecords(false);
    
    setEditForm({
      first_name: patient.first_name,
      last_name: patient.last_name,
      relationship_status: patient.relationship_status || 'Single',
      phone: patient.phone || '',
      address: patient.address || ''
    });

    setStatus({ text: `📌 Active working context bound to: ${patient.first_name} ${patient.last_name}`, type: 'SUCCESS' });

    try {
      const rawVisits = await localDb.visit
        .where('patient_id')
        .equals(patient.patient_id)
        .toArray();

      if (rawVisits && rawVisits.length > 0) {
        rawVisits.sort((a, b) => new Date(b.visit_date || b.created_at) - new Date(a.visit_date || a.created_at));

        const assembledLatestVisit = await compile3NFVisitRecord(rawVisits[0]);
        setLastVisitCache(assembledLatestVisit);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentRawVisits = rawVisits.filter(v => new Date(v.visit_date || v.created_at) >= thirtyDaysAgo);
        const assembledMonthlyList = await Promise.all(recentRawVisits.map(v => compile3NFVisitRecord(v)));
        setLastMonthCache(assembledMonthlyList);

        const compiledFullList = await Promise.all(rawVisits.map(v => compile3NFVisitRecord(v)));
        setPatientFullHistoryList(compiledFullList);
      } else {
        setPatientFullHistoryList([]);
      }
    } catch (err) {
      console.error("Offline summary fetch error:", err);
    }
  };

  const handleUpdatePatientProfile = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;

    const updatedPatient = {
      ...selectedPatient,
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      relationship_status: editForm.relationship_status,
      phone: editForm.phone.trim(),
      address: editForm.address.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      await localDb.patients.put(updatedPatient);

      await localDb.sync_outbox.add({
        outbox_id: crypto.randomUUID(),
        device_id: navigator.userAgent,
        action: 'UPDATE',
        table_name: 'patients',
        record_id: selectedPatient.patient_id,
        payload: {
          first_name: updatedPatient.first_name,
          last_name: updatedPatient.last_name,
          relationship_status: updatedPatient.relationship_status,
          phone: updatedPatient.phone,
          address: updatedPatient.address,
          updated_at: updatedPatient.updated_at
        },
        created_at: updatedPatient.updated_at,
        synced: 0
      });

      // 🛡️ TRIGGER SECURITY AUDIT AUTOMATIC SESSION INTERCEPT ENGINE (FOR UPDATES)
      let operatorEmail = 'Field Nurse';
      let operatorId = null;

      try {
        const storageKeys = ['user', 'session', 'supabase.auth.token', 'active_user'];
        let sessionData = null;

        for (const key of storageKeys) {
          const rawItem = localStorage.getItem(key);
          if (rawItem) {
            try {
              const parsed = JSON.parse(rawItem);
              const userObj = parsed.currentSession?.user || parsed.user || parsed;
              if (userObj?.email) {
                sessionData = userObj;
                break;
              }
            } catch {
              if (rawItem.includes('@')) operatorEmail = rawItem;
            }
          }
        }

        if (sessionData && sessionData.email) {
          operatorEmail = sessionData.email;
          operatorId = sessionData.id || sessionData.user_id || null;
        } else {
          const localUsers = await localDb.users.toArray();
          const activeSessionNode = localUsers.find(u => u.is_active === 1 || u.password !== '');
          if (activeSessionNode) {
            operatorEmail = activeSessionNode.email;
            operatorId = activeSessionNode.user_id;
          } else if (localUsers.length > 0) {
            const fallbackNode = localUsers[localUsers.length - 1];
            operatorEmail = fallbackNode.email;
            operatorId = fallbackNode.user_id;
          }
        }
      } catch (sessionErr) {
        console.warn("Automated audit stream extraction bypassed:", sessionErr);
      }

      if (!operatorId) {
        try {
          const firstValidUser = await localDb.users.toCollection().first();
          if (firstValidUser) {
            operatorId = firstValidUser.user_id;
            if (operatorEmail === 'Field Nurse') operatorEmail = firstValidUser.email;
          }
        } catch (dbErr) { console.error(dbErr); }
      }

      await logSecurityEvent(
        operatorId, 
        operatorEmail, 
        'UPDATE', 
        'Patient',
        selectedPatient.patient_id
      );

      setSelectedPatient(updatedPatient);
      setSearchResults(prev => prev.map(p => p.patient_id === updatedPatient.patient_id ? updatedPatient : p));
      setIsEditing(false);
      setStatus({ text: '🎉 Profile updated successfully on local node disk. Sync packet queued.', type: 'SUCCESS' });
      await processSyncOutbox();
    } catch (err) {
      console.error(err);
      setStatus({ text: '❌ Error: Failed to commit demographic modifications to internal system storage.', type: 'ERROR' });
    }
  };

  const handleFetchAndPrintFullHistory = async () => {
    if (!selectedPatient) return;
    setLoadingHistory(true);
    setStatus({ text: '🔄 Compiling complete 3NF historical database ledger for printing...', type: 'PENDING' });

    try {
      if (patientFullHistoryList.length === 0) {
        setStatus({ text: 'ℹ️ Printing Cancelled: Patient medical ledger chart contains zero active entry points.', type: 'INFO' });
        setLoadingHistory(false);
        return;
      }
      setGlobalHistory(patientFullHistoryList);
      setStatus({ text: `🖨️ Compiled medical sheets. Opening hardware print preview...`, type: 'SUCCESS' });
      setTimeout(() => { window.print(); }, 750);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePrintSingleLog = (visitRecord) => {
    setGlobalHistory([visitRecord]);
    setStatus({ text: `🖨️ Spooling tracking receipt for date: ${visitRecord.visit_date || 'Encounter'}`, type: 'SUCCESS' });
    setTimeout(() => { window.print(); }, 250);
  };

  const handlePrintCard = () => {
    setGlobalHistory([]); 
    setTimeout(() => { window.print(); }, 150);
  };

  const theme = getStatusTheme();

  return (
    <div style={{ position: 'relative', fontFamily: '"Montserrat", sans-serif' }}>
      
      <style>{`
        .search-field, .edit-field {
          width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid #cbd5e1;
          font-size: 14px; font-weight: 500; font-family: "Montserrat", sans-serif;
          background: #ffffff; box-sizing: border-box; transition: all 0.2s ease; color: #0f172a;
        }
        .search-field:focus, .edit-field:focus { 
          border-color: #004bf6 !important; box-shadow: 0 0 0 4px rgba(0, 75, 246, 0.08) !important; outline: none; 
        }
        .patient-row-card { 
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid #e2e8f0; background: #ffffff;
        }
        .patient-row-card:hover { 
          transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); border-color: #cbd5e1 !important; 
        }
        .vault-button {
          padding: 10px 14px; background: #004bf6; color: white; border: none; border-radius: 10px; 
          font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
          font-family: "Montserrat", sans-serif; transition: background 0.2s ease;
        }
        .vault-button:hover { background: #003cd1; }
        
        /* 📱 RESPONSIVE INTERACTION VIEWPORT STYLES */
        .search-matrix-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 24px;
        }

        @media (max-width: 1024px) {
          .search-matrix-grid {
            grid-template-columns: 1fr;
          }
        }
        
        #printable-id-pass-container, #printable-history-report { display: none !important; }

        @media print {
          header, form, button, nav, .no-print, .vault-button, .modal-overlay { display: none !important; }
          body { background: white !important; padding: 0 !important; margin: 0 !important; }
          
          #printable-id-pass-container {
            display: ${globalHistory.length === 0 ? 'flex !important' : 'none !important'};
            flex-direction: column !important; justify-content: space-between !important;
            width: 85.6mm !important; height: 53.98mm !important; border: 2px solid #004bf6 !important;
            border-radius: 4.5mm !important; padding: 5mm !important; background: #ffffff !important;
            margin: 40mm auto !important; page-break-inside: avoid !important;
          }
          #printable-id-pass-container * { display: block !important; }

          #printable-history-report {
            display: ${globalHistory.length > 0 ? 'block !important' : 'none !important'};
            font-family: "Montserrat", sans-serif !important; padding: 10mm !important;
            background: #ffffff !important; color: #000000 !important; width: 100% !important;
          }
          #printable-history-report * { display: block !important; }
          .report-visit-row { page-break-inside: avoid !important; margin-bottom: 8mm !important; padding-bottom: 6mm !important; border-bottom: 1px dashed #cbd5e1 !important; }
        }
      `}</style>

      {/* --- PRINT ASSETS --- */}
      {selectedPatient && (
        <div id="printable-id-pass-container">
          <div style={{ borderBottom: '1.5px solid #004bf6', paddingBottom: '1.5mm', marginBottom: '2mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ fontSize: '9px', fontWeight: '900', color: '#004bf6', textTransform: 'uppercase' }}>
              NIGERIA {printFacilityName} SECURITY PASS
            </span>
            <span style={{ fontSize: '12px' }}></span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{selectedPatient.first_name} {selectedPatient.last_name}</div>
          <div style={{ fontSize: '10px', color: '#475569' }}>Gender: <strong>{selectedPatient.gender}</strong> | DOB: <strong>{selectedPatient.date_of_birth}</strong></div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '1mm', padding: '2mm', marginTop: '3mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '900', color: '#004bf6' }}>{selectedPatient.barcode_id}</span>
          </div>
        </div>
      )}

      {selectedPatient && globalHistory.length > 0 && (
        <div id="printable-history-report">
          <div style={{ borderBottom: '3px solid #004bf6', paddingBottom: '4mm', marginBottom: '6mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#004bf6', margin: 0, textTransform: 'uppercase' }}>
                {printFacilityName} HEALTHCARE INFRASTRUCTURE
              </h1>
              <span style={{ fontSize: '12px', color: '#475569' }}>Official Patient Treatment Sheet Log Ledger</span>
            </div>
            <div style={{ textHex: 'right', fontSize: '11px', color: '#64748b' }}>Date Printed: {new Date().toLocaleDateString()}</div>
          </div>
          {globalHistory.map((visit) => (
            <div key={visit.visit_id} className="report-visit-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>
                <span>Encounter Record Entry Summary Sheet (3NF View)</span>
                <span>Date Stamped: {visit.visit_date || 'N/A'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0' }}>
                <div>🏋️‍♂️ <strong>Weight:</strong> {visit.weight_kg} kg</div>
                <div>🌡️ <strong>Temp:</strong> {visit.temperature_celsius} °C</div>
                <div>🩺 <strong>BP:</strong> {visit.blood_pressure}</div>
                <div>💓 <strong>Pulse:</strong> {visit.heart_rate} bpm</div>
              </div>
              <div style={{ fontSize: '13px', margin: '6px 0' }}><strong>Presenting Complaint:</strong> {visit.presenting_complaint} ({visit.duration_days})</div>
              <div style={{ fontSize: '13px', margin: '4px 0', color: '#004bf6', fontWeight: '700' }}>Assessment Diagnosis: {visit.diagnosis_notes}</div>
              <div style={{ fontSize: '13px', marginTop: '6px', background: '#f1f5f9', padding: '8px' }}>💊 <strong>Prescribed Medications:</strong> {visit.treatment_plan}</div>
            </div>
          ))}
        </div>
      )}

      {/* --- EDIT PROFILE POP-UP OVERLAY LAYER --- */}
      {isEditing && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#ffffff', width: '100%', maxWidth: '480px', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#004bf6', fontSize: '18px', fontWeight: '800' }}>Modify Patient Core Profile</h3>
            <form onSubmit={handleUpdatePatientProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#334155' }}>First Name</label>
                <input type="text" className="edit-field" value={editForm.first_name} onChange={e => setEditForm({...editForm, first_name: e.target.value})} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#334155' }}>Last Name</label>
                <input type="text" className="edit-field" value={editForm.last_name} onChange={e => setEditForm({...editForm, last_name: e.target.value})} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#334155' }}>Relationship Status</label>
                <select className="edit-field" value={editForm.relationship_status} onChange={e => setEditForm({...editForm, relationship_status: e.target.value})}>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#334155' }}>Phone Number</label>
                <input type="text" className="edit-field" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#334155' }}>Residential Address</label>
                <input type="text" className="edit-field" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsEditing(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 VIEWPORT FRAMEWORK LAYER (RESPONSIVE GRID CLASS LINKED) */}
      <div className="no-print search-matrix-grid" style={{ gridTemplateColumns: selectedPatient ? '1fr 1fr' : '1fr' }}>
        
        {/* LEFT HUB RETRIEVAL PANEL */}
        <div style={{ background: '#ffffff', padding: '28px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', height: 'fit-content' }}>
          <h2 style={{ color: '#004bf6', marginBottom: '18px', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.75px' }}>Patient Record Retrieval Hub</h2>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input type="text" disabled={searching} className="search-field" placeholder="Search by name or tap to scan barcode passport card..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1 }} />
            <button type="submit" disabled={searching} className="vault-button" style={{ padding: '12px 20px', fontSize: '14px' }}>
              {searching ? 'Syncing Storage Layers...' : 'Find Record'}
            </button>
          </form>

          {status.text && (
            <div style={{ padding: '14px 16px', background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${theme.leftBorder}`, marginBottom: '20px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
              {status.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {searchResults.map((patient) => {
              const isSelected = selectedPatient?.patient_id === patient.patient_id;
              return (
                <div 
                  key={patient.patient_id} 
                  className="patient-row-card" 
                  onClick={() => handleSelectPatient(patient)} 
                  style={{ 
                    padding: '18px', 
                    borderRadius: '14px', 
                    border: isSelected ? '1px solid #10b981' : '1px solid #e2e8f0', 
                    background: isSelected ? '#f0fdf4' : '#ffffff', 
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(16, 185, 129, 0.06)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '16px', color: '#0f172a', fontWeight: '700' }}>
                      {patient.first_name} {patient.last_name}
                    </strong>
                    <span style={{ fontSize: '11px', background: isSelected ? '#d1fae5' : '#f1f5f9', color: isSelected ? '#065f46' : '#475569', padding: '5px 12px', borderRadius: '8px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                      {patient.barcode_id}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginTop: '14px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: '#eff6ff', color: '#004bf6', fontSize: '12px' }}>🧬</span>
                      <span>{patient.gender}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', fontSize: '12px' }}>📅</span>
                      <span>DOB: {patient.date_of_birth}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: '#f0fdf4', color: '#16a34a', fontSize: '12px' }}>💍</span>
                      <span>{patient.relationship_status || 'Single'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT ACTION DASHBOARD PANEL HUB */}
        {selectedPatient && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* CORE MONITORING WORKSTATION DETAILS HUD */}
            <div style={{ background: '#ffffff', padding: '28px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', borderTop: '5px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '19px', fontWeight: '800' }}>Patient Workspace Context</h3>
                <button onClick={() => { setSelectedPatient(null); setViewingFullRecords(false); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '22px', fontWeight: 'bold' }}>✕</button>
              </div>
              
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', marginBottom: '16px', fontSize: '14px', lineHeight: '1.6', border: '1px solid #e2e8f0' }}>
                <div><strong>Full Name:</strong> {selectedPatient.first_name} {selectedPatient.last_name}</div>
                <div><strong>Gender:</strong> {selectedPatient.gender} | <strong>DOB:</strong> {selectedPatient.date_of_birth}</div>
                <div><strong>Relationship Status:</strong> <span style={{ color: '#004bf6', fontWeight: '700' }}>{selectedPatient.relationship_status || 'Single'}</span></div>
                <div><strong>Phone Number:</strong> {selectedPatient.phone || 'N/A'}</div>
                <div><strong>Address:</strong> {selectedPatient.address || 'N/A'}</div>
                <div style={{ marginTop: '6px' }}><strong>System Barcode Reference:</strong> <code style={{ color: '#004bf6', fontWeight: '800', background: 'rgba(0,75,246,0.04)', padding: '2px 6px', borderRadius: '4px' }}>{selectedPatient.barcode_id}</code></div>
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button 
                    type="button" 
                    onClick={() => setIsEditing(true)} 
                    style={{ 
                      flex: 1, padding: '12px', background: '#004bf6', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', fontFamily: '"Montserrat", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' 
                    }}
                    className="vault-button"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '5px', background: 'rgba(255,255,255,0.18)', fontSize: '11px' }}>📝</span>
                    Edit Profile Details
                  </button>
                  <button 
                    type="button" 
                    onClick={handlePrintCard} 
                    style={{ 
                      flex: 1, padding: '12px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', fontFamily: '"Montserrat", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' 
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '5px', background: '#f1f5f9', fontSize: '11px' }}>🖨️</span>
                    Passport Card
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button type="button" onClick={() => setViewingFullRecords(!viewingFullRecords)} style={{ flex: 1, padding: '12px', background: viewingFullRecords ? '#0f172a' : '#f1f5f9', color: viewingFullRecords ? '#ffffff' : '#0f172a', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                  {viewingFullRecords ? '📋 Hide Clinical Folders' : `📋 View Patient Detailed Records (${patientFullHistoryList.length})`}
                </button>
              </div>

              {viewingFullRecords && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '14px', fontWeight: '800' }}>Complete Historical Record Log Ledger</h4>
                  {patientFullHistoryList.length === 0 ? (
                    <span style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>Zero logged encounter rows bound to this subject chart.</span>
                  ) : (
                    patientFullHistoryList.map((visit, idx) => (
                      <div key={visit.visit_id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#004bf6' }}>Encounter #{patientFullHistoryList.length - idx}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>📅 {visit.visit_date}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px', background: '#f8fafc', padding: '10px', borderRadius: '6px', marginBottom: '8px', fontWeight: '600' }}>
                          <div>🏋️‍♂️ Weight: {visit.weight_kg}kg</div>
                          <div>🌡️ Temp: {visit.temperature_celsius}°C</div>
                          <div>🩺 BP: {visit.blood_pressure}</div>
                          <div>💓 Pulse: {visit.heart_rate}bpm</div>
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                          <strong>Presenting Complaint:</strong> {visit.presenting_complaint} ({visit.duration_days})<br />
                          <strong style={{ color: '#10b981' }}>Diagnosis Notes:</strong> {visit.diagnosis_notes}<br />
                          <strong>Treatment Prescribed:</strong> <span style={{ fontStyle: 'italic', color: '#475569' }}>{visit.treatment_plan}</span>
                        </div>
                        <button type="button" onClick={() => handlePrintSingleLog(visit)} style={{ marginTop: '10px', width: '100%', padding: '6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', color: '#475569' }}>🖨️ Print Single Encounter Sheet</button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <NewVisitWizard patient={selectedPatient} onComplete={() => handleSelectPatient(selectedPatient)} />
            </div>

            {/* RELATIONAL EMERGENCY BACKUP VAULT */}
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #fce8e6', borderTop: '5px solid #dc2626', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#c5221f', fontSize: '13px', fontWeight: '800' }}>🚨 EMERGENCY DISASTER RECOVERY HUB</h4>
              <div style={{ marginBottom: '16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', background: '#d97706', color: 'white', padding: '3px 8px', borderRadius: '6px', fontWeight: '800' }}>1. Last Incident Diagnostic snapshot</span>
                </div>
                <div style={{ fontSize: '13px', color: '#334155', fontWeight: '500' }}>
                  {lastVisitCache ? (
                    <div>
                      <strong>Encounter Date:</strong> {lastVisitCache.visit_date || 'N/A'} <br />
                      <strong>Symptoms:</strong> "{lastVisitCache.presenting_complaint}" ({lastVisitCache.duration_days}) <br />
                      <strong>Diagnosis Notes:</strong> <span style={{ color: '#004bf6', fontWeight: '700' }}>{lastVisitCache.diagnosis_notes}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No baseline encounters attached to this node registry.</span>
                  )}
                </div>
              </div>
              <button type="button" onClick={handleFetchAndPrintFullHistory} disabled={loadingHistory} className="vault-button" style={{ width: '100%', padding: '14px', background: '#0f172a' }}>
                {loadingHistory ? 'Compiling Print Spooler...' : '🖨️ Compile & Print Patient Chart History Ledger'}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}