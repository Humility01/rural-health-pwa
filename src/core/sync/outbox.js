import Dexie from 'dexie';

export const localDb = new Dexie('RuralHealthSyncCoreDB');

// Safe, compatible schema definition
localDb.version(4).stores({
  patients: 'patient_id, first_name, last_name, barcode_id',
  facilities: 'facility_id, facility_name, location',
  visit: 'visit_id, patient_id, user_id, visit_date',
  complaint: 'complaint_id, visit_id',
  vitals: 'vitals_id, visit_id',
  examination: 'examination_id, visit_id',
  medication_dispensed: 'med_dispensed_id, visit_id',
  past_medical_history: 'history_id, patient_id',
  allergy: 'allergy_id, patient_id',
  users: 'user_id, email, role',
  sync_outbox: 'outbox_id, device_id, action, table_name, record_id, synced, created_at'
});

// Handle upgrade errors gracefully without crashing the application
localDb.on('versionchange', () => {
  localDb.close();
});