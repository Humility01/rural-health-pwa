import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Your existing Supabase client initialization
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =========================================================================
// 🛡️ INTEGRATED SECURITY PIPELINE: AUDIT LOG GENERATOR UTILITY
// =========================================================================
export const logSecurityEvent = async (userId, username, action, resource, resourceId, ipAddress) => {
  const logPayload = {
    user_id: userId || null, // Fallback to null immediately if userId is empty or falsy
    username: username || 'System Operator',
    action: action,
    resource: resource,
    resource_id: resourceId,
    timestamp: new Date().toISOString(),
    ip_address: ipAddress || '127.0.0.1'
  };

  // 1. Primary Attempt: Send full log
  const { error } = await supabase
    .from('audit_log')
    .insert([logPayload]);

  // 2. Intercept Foreign Key Violations (PostgreSQL Error 23503)
  if (error && error.code === '23503') {
    console.warn("⚠️ Bypassing foreign key constraint for un-synced account. Saving with email metadata.");
    
    // Fallback attempt: Strip out the user_id UUID so PostgreSQL accepts the record string
    await supabase
      .from('audit_log')
      .insert([
        {
          ...logPayload,
          user_id: null // Passing NULL safely satisfies the relationship check
        }
      ]);
  } else if (error) {
    console.error("Audit log error:", error);
  }
};