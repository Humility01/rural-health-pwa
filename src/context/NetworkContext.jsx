import React, { createContext, useState, useEffect } from 'react';
import { synchronizeOutbox } from '../core/sync/engine';
import { processSyncOutbox } from '../core/sync/syncEngine';

// Create the global connection tracking box
export const NetworkContext = createContext();

export const NetworkProvider = ({ children }) => {
  // 1. Initialize status state with the browser's current online/offline condition
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // 2. Define what happens when the browser signals it is ONLINE
    const handleOnline = async () => {
      setIsOnline(true);
      console.log('Network Status: Device is back online! Triggering sync loop...');
      
      // Fire our automatic cloud sync process loop immediately
      await synchronizeOutbox();
      await processSyncOutbox();
    };

    // 3. Define what happens when the browser signals it is OFFLINE
    const handleOffline = () => {
      setIsOnline(false);
      console.log('Network Status: Device went offline. Local storage mode active.');
    };

    // 4. Bind these listeners directly to the browser window settings
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 5. Run an initial check on system boot to see if we have items to upload immediately
    if (navigator.onLine) {
      console.log('System Boot: Device detected online. Running initial outbox synchronization check...');
      processSyncOutbox();
    }

    // Clean up our window settings when the application turns off
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
};