import { localDb } from '../db/localDb';

/**
 * Adds a new transactional change to the offline synchronization outbox.
 * @param {string} tableName - The target table name in Supabase (e.g., 'patients')
 * @param {string} action - The database action ('CREATE' or 'UPDATE')
 * @param {string} recordId - The unique UUID of the patient or visit record
 * @param {Object} payload - The actual data content to be sent to the cloud
 */
export async function addToOutbox(tableName, action, recordId, payload) {
  const outboxEntry = {
    outbox_id: crypto.randomUUID(), // Generates a unique ID for this outbox ticket
    device_id: navigator.userAgent, // Tracks which browser/device made the entry
    action: action,                 // 'CREATE' or 'UPDATE'
    table_name: tableName,          // Which table this data belongs to
    record_id: recordId,            // The specific data row ID
    payload: payload,               // The actual health data package
    created_at: new Date().toISOString(),
    synced: 0                       // 0 means 'Pending Sync', 1 means 'Done'
  };

  // Write this transaction directly into our local Dexie IndexedDB outbox drawer
  await localDb.sync_outbox.add(outboxEntry);
}