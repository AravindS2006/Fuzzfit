'use client';
import { createContext, useContext, useEffect, useState } from 'react';
const TimeContext = createContext('UTC');
export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [zone, setZone] = useState('UTC');
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return <TimeContext.Provider value={zone}>{children}</TimeContext.Provider>;
}
export function useTimeFormat() {
  const timeZone = useContext(TimeContext);
  return {
    timeZone,
    dateLabel: (value: string) =>
      new Date(value).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone }),
    timeLabel: (value: string) =>
      new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone }),
  };
}
