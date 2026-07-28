import Dexie from 'dexie';

export const localDb = new Dexie('RuralHealthSyncCoreDB');

// 🌟 Version 3 Baseline
localDb.version(3).stores({
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
  sync_outbox: '++outbox_id, table_name, synced'
});

// 🌟 UPDATED: Version 4 aligns sync_outbox with Table 3.11 schema (UUID outbox_id, device_id, action, created_at)
localDb.version(4).stores({
  patients: 'patient_id, first_name, last_name, barcode_id', // String UUID
  facilities: 'facility_id, facility_name, location',       // String UUID
  visit: 'visit_id, patient_id, user_id, visit_date',       // String UUID
  complaint: 'complaint_id, visit_id',                      // String UUID
  vitals: 'vitals_id, visit_id',                            // String UUID
  examination: 'examination_id, visit_id',                  // String UUID
  medication_dispensed: 'med_dispensed_id, visit_id',        // String UUID
  past_medical_history: 'history_id, patient_id',            // String UUID
  allergy: 'allergy_id, patient_id',                        // String UUID
  users: 'user_id, email, role',                            // String UUID
  sync_outbox: 'outbox_id, device_id, action, table_name, record_id, synced, created_at' // String UUID matching Table 3.11
});