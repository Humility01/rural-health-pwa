import { supabase } from '../supabase/client';
import { localDb } from '../db/localDb';

// 🌐 BRIDGE MATRIX: Translates local IndexedDB singular names to exact Supabase cloud table names
const getSupabaseTableName = (localName) => {
  switch (localName) {
    case 'visit': return 'clinical_visits';
    case 'complaint': return 'complaints';
    case 'medication_dispensed': return 'medications_dispensed';
    case 'past_medical_history': return 'past_medical_history'; // ✅ Enabled native routing keys
    case 'allergy': return 'allergy';                           // ✅ Enabled native routing keys
    default: return localName; 
  }
};

// 🛡️ ADAPTIVE MATRIX KEY RESOLVER
const getPrimaryKeyColumn = (supabaseName) => {
  switch (supabaseName) {
    case 'users': return 'user_id';
    case 'patients': return 'patient_id';
    case 'clinical_visits': return 'visit_id';
    case 'vitals': return 'vitals_id';
    case 'complaints': return 'complaint_id';
    case 'medications_dispensed': return 'medication_id';
    case 'past_medical_history': return 'history_id';
    case 'allergy': return 'allergy_id';
    default: return 'id';
  }
};

export async function processSyncOutbox() {
  try {
    const pendingItems = await localDb.sync_outbox
      .where('synced')
      .equals(0)
      .toArray();

    if (pendingItems.length === 0) return;

    // 🛡️ RELATIONAL INTEGRITY SORTING: Guarantees parents commit flawlessly before children
    const tablePriority = {
      'users': 1,
      'patients': 2,
      'past_medical_history': 3,   // Demographic child tracks
      'allergy': 3,                // Demographic child tracks
      'clinical_visits': 4,        // Clinical parent encounter
      'visit': 4,
      'vitals': 5,
      'complaints': 5,
      'complaint': 5,
      'medications_dispensed': 5,
      'medication_dispensed': 5,
      'examination': 5
    };
   
    pendingItems.sort((a, b) => (tablePriority[a.table_name] || 99) - (tablePriority[b.table_name] || 99));

    console.log(`Sync Engine woke up. Processing ${pendingItems.length} records in strict relational order...`);

    for (const item of pendingItems) {
      let uploadSuccess = false;

      const cloudTableName = getSupabaseTableName(item.table_name);
      const primaryKeyField = getPrimaryKeyColumn(cloudTableName);

      // Security Intercept
      if (cloudTableName === 'users') {
        const payloadRole = item.payload?.role;
        const isRevocationOrDeletion = item.action === 'DELETE' || item.payload?.status === 'REVOKED';

        if (payloadRole === 'SUPER_ADMIN' && isRevocationOrDeletion) {
          await localDb.sync_outbox.delete(item.outbox_id);
          continue;
        }
      }

      // =========================================================================
      // 📥 ACTION: CREATE 
      // =========================================================================
      if (item.action === 'CREATE') {
        const cleanPayload = { ...item.payload };

        // Handle offline-first structural safety checks natively
        if (cloudTableName === 'examination') {
          console.warn(`⚠️ Skipping Cloud Sync for local examination logs backup.`);
          uploadSuccess = true;
        } else {
          const { error } = await supabase
            .from(cloudTableName)
            .insert([cleanPayload]);

          if (!error) {
            uploadSuccess = true;
          } else {
            console.error(`❌ Supabase CREATE Rejection on table [${cloudTableName}]:`, {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code
            });
            
            if (error.code === 'PGRST205') {
              uploadSuccess = true; 
            }
          }
        }
      }

      // =========================================================================
      // 🔄 ACTION: UPDATE
      // =========================================================================
      if (item.action === 'UPDATE') {
        const cleanPayload = { ...item.payload };

        const { error } = await supabase
          .from(cloudTableName)
          .update(cleanPayload)
          .eq(primaryKeyField, item.record_id);

        if (!error) {
          uploadSuccess = true;
        } else {
          console.error(`❌ Supabase UPDATE Rejection on table [${cloudTableName}]:`, {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
        }
      }

      // Clear the packet from the local outbox if successful
      if (uploadSuccess) {
        await localDb.sync_outbox.delete(item.outbox_id);
        console.log(`👍 Record ID ${item.record_id} [${cloudTableName}] successfully synchronized and cleared.`);
      }
    }
  } catch (err) {
    console.error("The background synchronization channel crashed:", err);
  }
}

// =========================================================================
// 📡 STABILIZED NETWORK SOCKET EVENT LISTENER INTERCEPTOR
// =========================================================================
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('online', () => {
    console.log("📡 Hardware reports Internet connection restored. Monitoring socket stability...");
    
    // 🌟 1.5-Second Delay to bypass initial network handshake latency drop drops!
    setTimeout(async () => {
      if (navigator.onLine) {
        console.log("🔄 Socket connection stable. Launching outbox sync...");
        await processSyncOutbox();
      }
    }, 1500);
  });
}