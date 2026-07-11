import React, { useState, useEffect } from 'react';
import { localDb } from '../../core/db/localDb';

export default function SyncStatusIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // 1. Listeners to monitor network changes instantly
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. Continuous lightweight polling loop to check the local outbox queue length
    const interval = setInterval(async () => {
      try {
        const count = await localDb.sync_outbox
          .where('synced')
          .equals(0)
          .count();
        setPendingCount(count);
      } catch (err) {
        console.error("Failed to read outbox count locally:", err);
      }
    }, 1500); // Checks every 1.5 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  // Determine styles and messages based on network status and outbox count
  let statusBg = '#f0fdf4'; // Light green
  let statusColor = '#15803d'; // Dark green
  let statusText = '● System Cloud Sync: Fully Operational';

  if (!isOnline) {
    statusBg = '#fef2f2'; // Light red
    statusColor = '#b91c1c'; // Dark red
    statusText = `● Offline Mode Active (${pendingCount} Records Cached On Disk)`;
  } else if (pendingCount > 0) {
    statusBg = '#fff7ed'; // Light orange
    statusColor = '#c2410c'; // Dark orange
    statusText = `Syncing Data Stream... (${pendingCount} pending uploads)`;
  }

  return (
    <div style={{
      padding: '10px 16px',
      background: statusBg,
      color: statusColor,
      borderRadius: 'var(--radius-sm, 6px)',
      fontWeight: '600',
      fontSize: '13px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      border: `1px solid ${statusColor}33`,
      transition: 'all 0.3s ease'
    }}>
      <span>{statusText}</span>
      <span style={{ 
        fontSize: '11px', 
        background: isOnline ? '#bbf7d0' : '#fecaca', 
        color: isOnline ? '#166534' : '#991b1b',
        padding: '2px 8px',
        borderRadius: '12px',
        textTransform: 'uppercase',
        fontWeight: 'bold'
      }}>
        {isOnline ? 'Network Online' : 'Network Disconnected'}
      </span>
    </div>
  );
}