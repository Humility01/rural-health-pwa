import React, { useState } from 'react';
import { localDb } from '../../core/db/localDb';
import { processSyncOutbox } from '../../core/sync/syncEngine';
import { logSecurityEvent } from '../../core/supabase/client';

// Direct path mapping to your exact file location inside the supabase folder sub-node
import { supabase } from '../../core/supabase/client';

export default function RegistrationPage() {
  // --- Core Demographics States ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [relationshipStatus, setRelationshipStatus] = useState(''); 
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  
  // --- Past Medical History States (ERD Aligned) ---
  const [conditionName, setConditionName] = useState('');
  const [diagnosedDate, setDiagnosedDate] = useState('');
  const [historyNotes, setHistoryNotes] = useState('');

  // --- Allergy States (ERD Aligned) ---
  const [allergen, setAllergen] = useState('');
  const [reaction, setReaction] = useState('');

  const [status, setStatus] = useState({ text: '', type: '' }); 
  const [submitting, setSubmitting] = useState(false);

  const getStatusTheme = () => {
    switch (status.type) {
      case 'SUCCESS': return { bg: '#e6f4ea', text: '#137333', border: '#10b981' };
      case 'WARNING': return { bg: '#fffbeb', text: '#92400e', border: '#f59e0b' };
      case 'ERROR': return { bg: '#fce8e6', text: '#c5221f', border: '#dc2626' };
      case 'PENDING': return { bg: '#f0f4ff', text: '#004bf6', border: '#cbd5e1' };
      default: return { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
    }
  };

  // --- FLOW: PATIENT INTAKE WITH DYNAMIC AUTH TRACING SUBSYSTEM METHOD ---
  const handlePatientRegister = async (e) => {
    e.preventDefault();
    setStatus({ text: '', type: '' });

    if (!gender || !relationshipStatus) {
      setStatus({ text: '⚠️ Validation Boundary Block: Please ensure all demographic drop-downs are selected.', type: 'WARNING' });
      return;
    }

    setSubmitting(true);
    const newPatientId = crypto.randomUUID();
    const generatedBarcodeId = `RURAL-${Math.floor(100000 + Math.random() * 900000)}`;
    const timestamp = new Date().toISOString();

    const patientData = {
      patient_id: newPatientId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dob,
      gender: gender,
      relationship_status: relationshipStatus, 
      phone: phone.trim() || null,
      address: address.trim() || null,
      barcode_id: generatedBarcodeId,
      created_at: timestamp,
      updated_at: timestamp
    };

    try {
      await localDb.patients.add(patientData);
      
      const syncPackets = [
        { table: 'patients', id: newPatientId, payload: patientData }
      ];

      if (conditionName.trim()) {
        const historyData = {
          history_id: crypto.randomUUID(),
          patient_id: newPatientId,
          condition_name: conditionName.trim(),
          diagnosed_date: diagnosedDate || null,
          notes: historyNotes.trim() || null
        };
        await localDb.past_medical_history.add(historyData);
        syncPackets.push({ table: 'past_medical_history', id: historyData.history_id, payload: historyData });
      }

      if (allergen.trim()) {
        const allergyData = {
          allergy_id: crypto.randomUUID(),
          patient_id: newPatientId,
          allergen: allergen.trim(),
          reaction: reaction.trim() || null
        };
        await localDb.allergy.add(allergyData);
        syncPackets.push({ table: 'allergy', id: allergyData.allergy_id, payload: allergyData });
      }

      for (const packet of syncPackets) {
        await localDb.sync_outbox.add({
          outbox_id: crypto.randomUUID(),
          device_id: navigator.userAgent,
          action: 'CREATE',
          table_name: packet.table,
          record_id: packet.id,
          payload: packet.payload,
          created_at: timestamp,
          synced: 0
        });
      }

      // 🛡️ SECURITY AUDIT AUTOMATIC SESSION INTERCEPT ENGINE
      let operatorEmail = 'Field Nurse';
      let operatorId = null;

      try {
        // 1. Check all potential LocalStorage slots for active profile payload strings
        const storageKeys = ['user', 'session', 'supabase.auth.token', 'active_user'];
        let sessionData = null;

        for (const key of storageKeys) {
          const rawItem = localStorage.getItem(key);
          if (rawItem) {
            try {
              const parsed = JSON.parse(rawItem);
              // Handle Supabase default auth session indexing depth wraps nested inside current object
              const userObj = parsed.currentSession?.user || parsed.user || parsed;
              if (userObj?.email) {
                sessionData = userObj;
                break;
              }
            } catch {
              if (rawItem.includes('@')) {
                operatorEmail = rawItem;
              }
            }
          }
        }

        if (sessionData && sessionData.email) {
          operatorEmail = sessionData.email;
          operatorId = sessionData.id || sessionData.user_id || null;
        } else {
          // 2. LocalDB Scan Fallback: Extract the user account based on active system parameters
          const localUsers = await localDb.users.toArray();
          
          // Look for any logged-in row context parameters
          const activeSessionNode = localUsers.find(u => u.is_active === 1 || u.password !== '');
          if (activeSessionNode) {
            operatorEmail = activeSessionNode.email;
            operatorId = activeSessionNode.user_id;
          } else if (localUsers.length > 0) {
            // Pick the latest authentic user matching structural rules
            const fallbackNode = localUsers[localUsers.length - 1];
            operatorEmail = fallbackNode.email;
            operatorId = fallbackNode.user_id;
          }
        }
      } catch (sessionErr) {
        console.warn("Automated audit stream extraction bypassed:", sessionErr);
      }

      // 3. Fallback Validation check against our strict database foreign key constraint
      if (!operatorId) {
        try {
          const firstValidUser = await localDb.users.toCollection().first();
          if (firstValidUser) {
            operatorId = firstValidUser.user_id;
            if (operatorEmail === 'Field Nurse') operatorEmail = firstValidUser.email;
          }
        } catch (dbErr) { console.error(dbErr); }
      }

      // Fire security vector trail straight to Supabase instance channels
      await logSecurityEvent(
        operatorId, 
        operatorEmail, 
        'CREATE', 
        'Patient',
        newPatientId
      );

      setStatus({ text: '📥 Patient profile with initial historic vectors successfully saved to disk.', type: 'PENDING' });
      await processSyncOutbox();
      
      setFirstName(''); setLastName(''); setDob(''); setPhone(''); setAddress(''); setGender(''); setRelationshipStatus('');
      setConditionName(''); setDiagnosedDate(''); setHistoryNotes(''); setAllergen(''); setReaction('');
      
      setStatus({ 
        text: `🎉 Registration Success! Profile and relational traits updated. Barcode: ${generatedBarcodeId}`, 
        type: 'SUCCESS' 
      });
    } catch (error) {
      console.error(error);
      setStatus({ text: '❌ System Error committing relational records to IndexedDB framework.', type: 'ERROR' });
    } finally {
      setSubmitting(false);
    }
  };

  const theme = getStatusTheme();

  return (
    <div style={{ 
      background: '#ffffff', 
      padding: '32px', 
      borderRadius: '16px', 
      border: '1px solid #e2e8f0', 
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02)', 
      marginBottom: '24px',
      fontFamily: '"Montserrat", sans-serif'
    }}>
      
      <style>{`
        .form-input-field {
          width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #cbd5e1; 
          font-size: 14px; font-weight: 500; font-family: "Montserrat", sans-serif;
          background: #ffffff; box-sizing: border-box; transition: all 0.2s ease; color: #0f172a;
        }
        .form-input-field:focus {
          border-color: #004bf6 !important; box-shadow: 0 0 0 4px rgba(0, 75, 246, 0.08) !important; outline: none;
        }
        .field-label {
          display: block; margin-bottom: 8px; font-weight: 700; font-size: 13px; color: #334155;
        }
        .section-heading {
          font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; 
          margin-bottom: 20px; border-bottom: 2px solid #f8fafc; padding-bottom: 8px; font-weight: 800;
        }
        .action-button {
          background: #004bf6; color: white; border: none; padding: 12px 24px; border-radius: 10px;
          font-weight: 700; cursor: pointer; font-family: "Montserrat", sans-serif; transition: background 0.2s;
        }
        .action-button:hover {
          background: #003cc4;
        }
        .action-button:disabled {
          background: #cbd5e1; cursor: not-allowed;
        }
      `}</style>

      <h2 style={{ color: '#004bf6', marginBottom: '24px', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.75px' }}>
        New Patient Registration & 3NF Clinical Records Entry
      </h2>

      {status.text && (
        <div style={{ 
          padding: '14px 16px', background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, 
          marginBottom: '24px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', lineHeight: '1.4'
        }}>
          {status.text}
        </div>
      )}

      {/* --- PATIENT INTAKE FORM --- */}
      <form onSubmit={handlePatientRegister}>
        <h3 className="section-heading" style={{ color: '#004bf6', borderBottomColor: '#f1f5f9' }}>
          1. Demographic Indicators
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label className="field-label">First Name *</label>
            <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Sunday" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Last Name *</label>
            <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Judah" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label className="field-label">Date of Birth *</label>
            <input type="date" disabled={submitting} className="form-input-field" value={dob} onChange={(e) => setDob(e.target.value)} required style={{ cursor: 'pointer' }} />
          </div>
          <div>
            <label className="field-label">Gender *</label>
            <select disabled={submitting} className="form-input-field" value={gender} onChange={(e) => setGender(e.target.value)} required style={{ cursor: 'pointer' }}>
              <option value="">-- Select Gender --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label className="field-label">Relationship Status *</label>
            <select disabled={submitting} className="form-input-field" value={relationshipStatus} onChange={(e) => setRelationshipStatus(e.target.value)} required style={{ cursor: 'pointer' }}>
              <option value="">-- Select Relationship Status --</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>
          <div>
            <label className="field-label">Phone Number</label>
            <input type="tel" disabled={submitting} className="form-input-field" placeholder="e.g., 09076854321" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label className="field-label">Residential Address</label>
          <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Chanchaga, Minna" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <h3 className="section-heading" style={{ color: '#0369a1', borderBottomColor: '#e0f2fe' }}>
          2. Past Medical History (Optional Baseline)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
          <div>
            <label className="field-label">Condition Name</label>
            <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Hypertension, Diabetes" value={conditionName} onChange={(e) => setConditionName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Diagnosed Date</label>
            <input type="date" disabled={submitting} className="form-input-field" value={diagnosedDate} onChange={(e) => setDiagnosedDate(e.target.value)} style={{ cursor: 'pointer' }} />
          </div>
        </div>
        <div style={{ marginBottom: '32px' }}>
          <label className="field-label">History Clinical Notes</label>
          <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Managed on routine outpatient medication since diagnosis" value={historyNotes} onChange={(e) => setHistoryNotes(e.target.value)} />
        </div>

        <h3 className="section-heading" style={{ color: '#b45309', borderBottomColor: '#fef3c7' }}>
          3. Allergy Sensitivities Registry (Optional Baseline)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
          <div>
            <label className="field-label">Allergen</label>
            <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Penicillin" value={allergen} onChange={(e) => setAllergen(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Reaction Notes</label>
            <input type="text" disabled={submitting} className="form-input-field" placeholder="e.g., Skin Rashes" value={reaction} onChange={(e) => setReaction(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="action-button" disabled={submitting} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <svg width="18" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          {submitting ? 'Processing Intake...' : 'Register Patient & Stream Sync'}
        </button>
      </form>
    </div>
  );
}