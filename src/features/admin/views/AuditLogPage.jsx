import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient'; // Adjusted to match your feature-folder depth

export function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering states matching criteria outlined in your Chapter Four write-up
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');

  useEffect(() => {
    fetchAuditLogs();
  }, [filterUser, filterAction, filterResource]);

  async function fetchAuditLogs() {
    try {
      setLoading(true);
      // Fetching records from the security audit log database table schema
      let query = supabase
        .from('audit_log')
        .select(`*, user:user_id(username)`)
        .order('timestamp', { ascending: false });

      // Apply granular filtering rules based on user interactions
      if (filterUser) {
        query = query.ilike('user.username', `%${filterUser}%`);
      }
      if (filterAction) {
        query = query.eq('action', filterAction);
      }
      if (filterResource) {
        query = query.eq('resource', filterResource);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error executing audit trail lookup:', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', padding: '24px', backgroundColor: '#ffffff' }}>
      <h2 style={{ color: '#0f172a', marginBottom: '6px', fontSize: '22px', fontWeight: '700' }}>🛡️ Security Audit Log Interface</h2>
      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
        Compliance Monitoring: Active accountability trail verification in compliance with data privacy frameworks.
      </p>

      {/* --- FILTER CONTROL UTILITY BAR --- */}
      <div style={{ 
        display: 'flex', gap: '16px', backgroundColor: '#f8fafc', 
        padding: '16px', borderRadius: '8px', marginBottom: '24px', flexWrap: 'wrap',
        border: '1px solid #e2e8f0'
      }}>
        <input
          type="text"
          placeholder="Filter by Username..."
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          style={{ 
            padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', 
            flex: '1', fontSize: '14px', fontFamily: 'Montserrat, sans-serif' 
          }}
        />
        
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'Montserrat, sans-serif' }}
        >
          <option value="">All Operational Actions</option>
          <option value="LOGIN">LOGIN</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="SYNC">SYNC</option>
        </select>

        <select
          value={filterResource}
          onChange={(e) => setFilterResource(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'Montserrat, sans-serif' }}
        >
          <option value="">All System Modules</option>
          <option value="Patient">Patient Records</option>
          <option value="Visit">Clinical Encounters</option>
          <option value="User">User Administration</option>
        </select>
      </div>

      {/* --- AUDIT TRAIL DATA GRID PANEL --- */}
      {loading ? (
        <p style={{ color: '#64748b', fontSize: '14px' }}>Querying structural log registries...</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', color: '#334155', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 16px', fontWeight: '600' }}>Timestamp Event</th>
                <th style={{ padding: '14px 16px', fontWeight: '600' }}>User Operator</th>
                <th style={{ padding: '14px 16px', fontWeight: '600' }}>Operation Type</th>
                <th style={{ padding: '14px 16px', fontWeight: '600' }}>Affected Resource</th>
                <th style={{ padding: '14px 16px', fontWeight: '600' }}>Originating IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    No verifiable transaction events matching tracking parameters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.log_id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                    <td style={{ padding: '14px 16px', color: '#64748b' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: '600', color: '#1e293b' }}>
                      {log.user?.username || 'System Background Node'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px',
                        backgroundColor: log.action === 'LOGIN' ? '#e0f2fe' : log.action === 'CREATE' ? '#dcfce7' : log.action === 'SYNC' ? '#fae8ff' : '#fef9c3',
                        color: log.action === 'LOGIN' ? '#0369a1' : log.action === 'CREATE' ? '#15803d' : log.action === 'SYNC' ? '#a21caf' : '#a16207'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#334155', fontWeight: '500' }}>{log.resource}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: '13px' }}>
                      {log.ip_address || '127.0.0.1'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}