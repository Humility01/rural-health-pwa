import React, { useState } from 'react';
import { localDb } from '../../../core/db/localDb';
import { processSyncOutbox } from '../../../core/sync/syncEngine';
import { useAuth } from '../../../context/AuthContext'; // ✅ Handled active auth layout session listener

export default function NewVisitWizard({ patient, onComplete }) {
  const { currentUser } = useAuth(); // ✅ Extracting the authenticated session token context
  const patientId = patient?.patient_id;
  const patientName = patient ? `${patient.first_name} ${patient.last_name}` : '';

  // --- ERD COMPLIANT STATE PARAMETERS ---
  // Complaint Table
  const [symptom, setSymptom] = useState('');
  const [duration, setDuration] = useState('');

  // Vitals Table
  const [temperature, setTemperature] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [weight, setWeight] = useState(''); 

  // Examination Table
  const [generalAppearance, setGeneralAppearance] = useState('');
  const [systemFindings, setSystemFindings] = useState('');
  const [diagnosisNotes, setDiagnosisNotes] = useState('');

  // Medication Dispensed Table
  const [drugName, setDrugName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [medDuration, setMedDuration] = useState('');

  const [statusMessage, setStatusMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSaveEncounter = async (e) => {
    e.preventDefault();

    if (!patientId) {
      setStatusMessage('❌ Error: No active patient chart selected.');
      return;
    }

    setSubmitting(true);
    const newVisitId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const visitDateString = timestamp.split('T')[0];

    // Isolate a compliant matching UUID for user tracking rows
    const validOperatorUuid = currentUser?.user_id || "00000000-0000-0000-0000-000000000000";

    // =========================================================================
    // 🏥 RECONCILED SCHEMA OBJECT MODEL MAPPING - 100% ALIGNED WITH NEW SQL
    // =========================================================================

    // 1. Visit Entity (Perfect match for your clean public.clinical_visits schema)
    const visitData = {
      visit_id: newVisitId,
      patient_id: patientId,
      visit_date: visitDateString, 
      relationship_status: patient?.relationship_status || 'Single',
      facility_id: '05953ac8-a273-4680-901a-2cc0b9dd00ae', // Your default live FUTMinna facility UUID node
      vitals_summary: `Temp: ${temperature || 'N/A'}°C | BP: ${bpSys && bpDia ? `${bpSys}/${bpDia}` : 'N/A'}`,
      clinical_notes: `Complaint: ${symptom.trim()}. Appearance: ${generalAppearance.trim() || 'Normal'}.`
    };

    // 2. Complaint Entity (Perfect match for your public.complaints schema)
    const complaintData = {
      complaint_id: crypto.randomUUID(),
      visit_id: newVisitId,
      symptom: symptom.trim(),
      duration: duration.trim() // Sent as raw text string matching your new TEXT schema type
    };

    // 3. Vitals Entity (Perfect match for your public.vitals schema)
    const vitalsData = {
      vitals_id: crypto.randomUUID(),
      visit_id: newVisitId,
      temperature: temperature ? parseFloat(temperature) : null,
      blood_pressure: bpSys && bpDia ? `${bpSys}/${bpDia}` : 'N/A', // Clean single string column format "120/80"
      heart_rate: heartRate ? parseInt(heartRate) : null,
      weight: weight ? parseFloat(weight) : null
    };

    // 4. Examination Entity
    const examinationData = {
      examination_id: crypto.randomUUID(),
      visit_id: newVisitId,
      general_appearance: generalAppearance.trim() || null,
      system_findings: systemFindings.trim() || null,
      diagnosis_notes: diagnosisNotes.trim() || null
    };

    // 5. Medication Dispensed Entity (Perfect match for your public.medications_dispensed schema)
    const medicationData = {
      med_dispensed_id: crypto.randomUUID(),
      visit_id: newVisitId,
      drug_name: drugName.trim() || 'None Prescribed',
      dosage: dosage.trim() || null,
      frequency: frequency.trim() || null,
      duration: medDuration.trim() || null // Clean text parameter field
    };

    try {
      // 📴 STEP A: Batch write directly into singular named local IndexedDB tables
      await localDb.visit.add(visitData);
      await localDb.complaint.add(complaintData);
      await localDb.vitals.add(vitalsData);
      await localDb.examination.add(examinationData);
      await localDb.medication_dispensed.add(medicationData);

      // 📦 STEP B: Queue transaction payloads matching exact Supabase destination metrics
      const syncPackets = [
        { table: 'clinical_visits', id: newVisitId, payload: visitData },
        { table: 'complaints', id: complaintData.complaint_id, payload: complaintData },
        { table: 'vitals', id: vitalsData.vitals_id, payload: vitalsData },
        { table: 'examination', id: examinationData.examination_id, payload: examinationData },
        { table: 'medications_dispensed', id: medicationData.med_dispensed_id, payload: medicationData }
      ];

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

      setStatusMessage('🎉 Local 3NF encounter logged in IndexedDB. Sync engine spinning up...');
      
      // Wake up engine background routine channels immediately
      await processSyncOutbox();

      // Clear all form input matrices cleanly
      setSymptom(''); setDuration('');
      setTemperature(''); setBpSys(''); setBpDia(''); setHeartRate(''); setRespiratoryRate(''); setWeight('');
      setGeneralAppearance(''); setSystemFindings(''); setDiagnosisNotes('');
      setDrugName(''); setDosage(''); setFrequency(''); setMedDuration('');

      if (onComplete) onComplete();
    } catch (error) {
      console.error("Critical IndexedDB transaction compilation failure:", error);
      setStatusMessage('❌ Systems Local Store Error: Constraint failure processing 3NF layout arrays.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '24px', fontFamily: '"Montserrat", sans-serif' }}>
      
      <style>{`
        .wizard-input, .wizard-textarea {
          width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #cbd5e1;
          font-size: 14px; font-weight: 500; font-family: "Montserrat", sans-serif;
          color: #0f172a; background-color: #ffffff; box-sizing: border-box;
          transition: all 0.2s ease-in-out;
        }
        .wizard-input:focus, .wizard-textarea:focus {
          border-color: #004bf6 !important; box-shadow: 0 0 0 4px rgba(0, 75, 246, 0.08) !important; outline: none;
        }
        .wizard-label { display: block; margin-bottom: 8px; font-weight: 700; font-size: 13px; color: #334155; }
        .submit-btn {
          width: 100%; padding: 15px; background: #004bf6; color: white; border: none;
          border-radius: 12px; font-weight: 700; font-size: 14px; font-family: "Montserrat", sans-serif;
          cursor: pointer; transition: background 0.2s ease, transform 0.1s ease;
        }
        .submit-btn:hover { background: #003cd1; }
      `}</style>

      <h3 style={{ color: '#004bf6', fontSize: '18px', fontWeight: '800', margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>
        New Clinical Encounter Wizard (100% 3NF Aligned)
      </h3>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0', fontWeight: '500' }}>
        Recording observations for: <strong style={{ color: '#0f172a', fontWeight: '700' }}>{patientName}</strong>
      </p>

      {statusMessage && (
        <div style={{ padding: '14px 16px', background: '#f0f4ff', color: '#004bf6', border: '1px solid #cbd5e1', borderRadius: '12px', marginBottom: '20px', fontWeight: '600', fontSize: '13px', lineHeight: '1.4' }}>
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSaveEncounter} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* SECTION A: COMPLAINT ENTRY */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
          <div>
            <label className="wizard-label">Presenting Complaint / Symptom *</label>
            <input type="text" className="wizard-input" placeholder="e.g., Fever spikes, acute migration headache" value={symptom} onChange={(e) => setSymptom(e.target.value)} required />
          </div>
          <div>
            <label className="wizard-label">Duration (Days)</label>
            <input type="text" className="wizard-input" placeholder="e.g., 3 days" value={duration} onChange={(e) => setDuration(e.target.value)} required />
          </div>
        </div>

        {/* SECTION B: SPLIT VITALS METRIC CONTAINER */}
        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ display: 'block', marginBottom: '14px', fontSize: '11px', fontWeight: '800', color: '#004bf6', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              1. Vital Signs Log (Relational Metrics)
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px' }}>Temp (°C)</label>
              <input type="number" step="0.1" className="wizard-input" placeholder="36.5" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px' }}>BP (Systolic - mmHg)</label>
              <input type="number" className="wizard-input" placeholder="120" value={bpSys} onChange={(e) => setBpSys(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px' }}>BP (Diastolic - mmHg)</label>
              <input type="number" className="wizard-input" placeholder="80" value={bpDia} onChange={(e) => setBpDia(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px' }}>Heart Rate (bpm)</label>
              <input type="number" className="wizard-input" placeholder="72" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px' }}>Respiratory Rate (c/m)</label>
              <input type="number" className="wizard-input" placeholder="18" value={respiratoryRate} onChange={(e) => setRespiratoryRate(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px' }}>Weight (kg)</label>
              <input type="number" step="0.1" className="wizard-input" placeholder="70.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>
        </div>

        {/* SECTION C: EXAMINATION RESULTS */}
        <div style={{ background: '#e6f4ea', padding: '20px', borderRadius: '14px', border: '1px solid #10b981' }}>
          <span style={{ display: 'block', marginBottom: '14px', fontSize: '11px', fontWeight: '800', color: '#137333', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              2. Clinical Examination Subsystem
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label className="wizard-label" style={{ color: '#137333' }}>General Appearance</label>
              <input type="text" className="wizard-input" placeholder="e.g., Ill-looking, dehydrated, conscious" value={generalAppearance} onChange={(e) => setGeneralAppearance(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ color: '#137333' }}>System Findings</label>
              <input type="text" className="wizard-input" placeholder="e.g., Chest clear, abdominal tenderness" value={systemFindings} onChange={(e) => setSystemFindings(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="wizard-label" style={{ color: '#137333' }}>Diagnosis Notes</label>
            <input type="text" className="wizard-input" placeholder="e.g., Confirmed complicated P. falciparum malaria" value={diagnosisNotes} onChange={(e) => setDiagnosisNotes(e.target.value)} />
          </div>
        </div>

        {/* SECTION D: DISPENSARY MANAGEMENT GRID */}
        <div style={{ background: '#faf5ff', padding: '20px', borderRadius: '14px', border: '1px solid #f3e8ff' }}>
          <span style={{ display: 'block', marginBottom: '14px', fontSize: '11px', fontWeight: '800', color: '#6b21a8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              3. Medication Dispensed Logs
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px', color: '#6b21a8' }}>Drug Name</label>
              <input type="text" className="wizard-input" placeholder="Paracetamol" value={drugName} onChange={(e) => setDrugName(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px', color: '#6b21a8' }}>Dosage</label>
              <input type="text" className="wizard-input" placeholder="500mg" value={dosage} onChange={(e) => setDosage(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px', color: '#6b21a8' }}>Frequency</label>
              <input type="text" className="wizard-input" placeholder="Twice daily (2x/d)" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
            </div>
            <div>
              <label className="wizard-label" style={{ fontSize: '12px', color: '#6b21a8' }}>Duration</label>
              <input type="text" className="wizard-input" placeholder="3 days" value={medDuration} onChange={(e) => setMedDuration(e.target.value)} />
            </div>
          </div>
        </div>

        {/* COMPILING ACTION TRIGGER TRIGGER BUTTON */}
        <div style={{ marginTop: '8px' }}>
          <button type="submit" disabled={submitting} className="submit-btn">
             {submitting ? 'Streaming Relational 3NF Model Packets...' : 'Save Encounter Record (Offline-Safe)'}
          </button>
        </div>

      </form>
    </div>
  );
}