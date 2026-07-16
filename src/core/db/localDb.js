import Dexie from 'dexie';

export const localDb = new Dexie('RuralHealthSyncCoreDB');

// 🌟 FIXED: Incremented version to 3 to apply clean non-incrementing string UUID keys
localDb.version(3).stores({
  patients: 'patient_id, first_name, last_name, barcode_id', // String UUID
  facilities: 'facility_id, facility_name, location',       // String UUID (No ++)
  visit: 'visit_id, patient_id, user_id, visit_date',       // String UUID
  complaint: 'complaint_id, visit_id',                      // String UUID
  vitals: 'vitals_id, visit_id',                            // String UUID
  examination: 'examination_id, visit_id',                  // String UUID
  medication_dispensed: 'med_dispensed_id, visit_id',        // String UUID
  past_medical_history: 'history_id, patient_id',            // String UUID
  allergy: 'allergy_id, patient_id',                        // String UUID
  users: 'user_id, email, role',                            // String UUID (No ++)
  sync_outbox: '++outbox_id, table_name, synced'            // Auto-increment integer (Keep ++)
});