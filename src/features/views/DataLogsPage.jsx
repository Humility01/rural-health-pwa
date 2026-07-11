import React, { useState, useEffect } from 'react';
import { localDb } from '../../core/db/localDb';
import { processSyncOutbox } from '../../core/sync/syncEngine';
import { logSecurityEvent } from '../../core/supabase/client';

export default function DataLogsPage() {
  const [activeTab, setActiveTab] = useState('patients');
  const [patients, setPatients] = useState([]);
  const [visits, setVisits] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [logMessage, setLogMessage] = useState('');

  // Fetch local records out of our IndexedDB stores
  const refreshLocalLogs = async () => {
    try {
      const allPatients = await localDb.patients.toArray();
      const allVisits = await localDb.clinical_visits.toArray();
      setPatients(allPatients);
      setVisits(allVisits);
    } catch (err) {
      console.error("Failed to load local logs registry:", err);
    }
  };

  useEffect(() => {
    refreshLocalLogs();
    // Auto refresh local log grids every 5 seconds to catch incoming sync modifications
    const interval = setInterval(refreshLocalLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSyncForce = async () => {
    setSyncing(true);
    setLogMessage(' Force-flushing local outbox registers into cloud pipeline...');
    try {
      await processSyncOutbox();
      await refreshLocalLogs();
      setLogMessage(' Manual outbox synchronization cycle completed successfully.');

      // 🛡️ TRIGGER SECURITY AUDIT TRAIL FOR SYSTEM DATA RECONCILIATION
      let cachedUser = null;
      try {
        const localUsers = await localDb.users.toArray();
        if (localUsers && localUsers.length > 0) {
          cachedUser = localUsers[0];
        }
      } catch (fErr) { 
        console.warn("Could not find logged-in session context for sync trace:", fErr); 
      }

      await logSecurityEvent(
        cachedUser?.user_id || null,
        cachedUser?.email || 'Sync Engine',
        'SYNC',
        'Outbox Queue'
      );

    } catch (err) {
      setLogMessage(' Manual sync force rejected. Verify gateway channel connection.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ color: 'var(--primary-color)', margin: 0, fontSize: '20px' }}>Local Storage Registry Viewer</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Inspecting transactional rows stored inside browser storage schemas.</p>
        </div>
        <button 
          onClick={handleManualSyncForce}
          disabled={syncing}
          style={{ padding: '10px 16px', background: syncing ? '#cbd5e1' : '#0ea5e9', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', cursor: syncing ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
        >
          {syncing ? 'Syncing...' : ' Force Sync Queue'}
        </button>
      </div>

      {logMessage && (
        <div style={{ padding: '10px', background: '#f8fafc', borderLeft: '4px solid #0ea5e9', color: '#334155', fontSize: '13px', fontWeight: '500', marginBottom: '16px' }}>
          {logMessage}
        </div>
      )}

      {/* Tabs Row Navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '16px', gap: '4px' }}>
        <button 
          onClick={() => setActiveTab('patients')}
          style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'patients' ? '3px solid var(--primary-color)' : '3px solid transparent', color: activeTab === 'patients' ? 'var(--primary-color)' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
        >
          👤 Local Patients ({patients.length})
        </button>
        <button 
          onClick={() => setActiveTab('visits')}
          style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'visits' ? '3px solid var(--primary-color)' : '3px solid transparent', color: activeTab === 'visits' ? 'var(--primary-color)' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
        >
           Local Encounter Logs ({visits.length})
        </button>
      </div>

      {/* PATIENTS DATA TABLE */}
      {activeTab === 'patients' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px', color: '#475569' }}>Barcode ID</th>
                <th style={{ padding: '12px', color: '#475569' }}>Full Name</th>
                <th style={{ padding: '12px', color: '#475569' }}>Gender</th>
                <th style={{ padding: '12px', color: '#475569' }}>DOB</th>
                <th style={{ padding: '12px', color: '#475569' }}>Patient UUID Reference</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.patient_id} style={{ borderBottom: '1px solid #f1f5f9', hover: {background: '#f8fafc'} }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--primary-color)' }}>{p.barcode_id}</td>
                  <td style={{ padding: '12px', fontWeight: '600' }}>{p.first_name} {p.last_name}</td>
                  <td style={{ padding: '12px' }}>{p.gender}</td>
                  <td style={{ padding: '12px' }}>{p.date_of_birth}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#64748b' }}>{p.patient_id}</td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No records populated inside browser disk yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CLINICAL VISITS DATA TABLE */}
      {activeTab === 'visits' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px', color: '#475569' }}>Encounter ID</th>
                <th style={{ padding: '12px', color: '#475569' }}>Patient Key Target</th>
                <th style={{ padding: '12px', color: '#475569' }}>Complaint</th>
                <th style={{ padding: '12px', color: '#475569' }}>Duration</th>
                <th style={{ padding: '12px', color: '#475569' }}>Vitals Metrics (JSON Object)</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.visit_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#64748b' }}>{v.visit_id.substring(0, 8)}...</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#0ea5e9' }}>{v.patient_id.substring(0, 8)}...</td>
                  <td style={{ padding: '12px', fontWeight: '600' }}>{v.presenting_complaint}</td>
                  <td style={{ padding: '12px' }}>{v.duration_days} days</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#16a34a' }}>
                    {JSON.stringify(v.vital_signs)}
                  </td>
                </tr>
              ))}
              {visits.length === 0 && (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No clinical encounters logged inside local cache drawer yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}