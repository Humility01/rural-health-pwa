import { localDb } from '../db/localDb';
import { supabase } from '../supabase/client';

/**
 * Automatically loops through the local offline outbox 
 * and attempts to synchronize pending entries up to Supabase.
 */
export async function synchronizeOutbox() {
  // 1. Check our local outbox for any records where synced is 0 (Pending)
  const pendingItems = await localDb.sync_outbox
    .where('synced')
    .equals(0)
    .toArray();

  // If there's nothing waiting in the outbox, stop here!
  if (pendingItems.length === 0) {
    console.log('Sync Engine: No pending changes to synchronize.');
    return { success: true, count: 0 };
  }

  console.log(`Sync Engine: Found ${pendingItems.length} items waiting to sync...`);

  // 2. Loop through each pending item one by one chronologically
  for (const item of pendingItems) {
    try {
      // Send the data package directly to the matching table in your Supabase cloud
      const { error } = await supabase
        .from(item.table_name)
        .upsert(item.payload); // Upsert inserts new rows or updates existing ones

      if (error) throw error;

      // 3. If the cloud database accepts it, mark it as successful (1) locally
      await localDb.sync_outbox.update(item.outbox_id, { synced: 1 });
      
      console.log(`Sync Engine: Successfully synchronized record ${item.record_id}`);
    } catch (err) {
      console.error(`Sync Engine: Failed to sync record ${item.record_id}. Will retry later.`, err);
      // We break the loop on failure so we don't send data out of chronological order
      break; 
    }
  }
}