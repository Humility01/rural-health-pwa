import Dexie from 'dexie';

export const localDb = new Dexie('RuralHealthSyncCoreDB');

localDb.version(1).stores({
  patients: '++patient_id, first_name, last_name, barcode_id',
  facilities: '++facility_id, facility_name', 
  visit: '++visit_id, patient_id, user_id, visit_date',
  complaint: '++complaint_id, visit_id',
  vitals: '++vitals_id, visit_id',
  examination: '++examination_id, visit_id',
  medication_dispensed: '++med_dispensed_id, visit_id',
  past_medical_history: '++history_id, patient_id',
  allergy: '++allergy_id, patient_id',
  users: '++user_id, email, role', 
  sync_outbox: '++outbox_id, table_name, synced'
});