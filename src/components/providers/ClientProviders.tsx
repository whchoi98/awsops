'use client';

import { useEffect } from 'react';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import AccountProvider from '@/contexts/AccountContext';

// Suppress known Recharts ResponsiveContainer warning (cosmetic, no functional impact)
function useSuppressRechartsWarning() {
  useEffect(() => {
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('The width(-1) and height(-1)')) return;
      origWarn.apply(console, args);
    };
    return () => { console.warn = origWarn; };
  }, []);
}

// Client-side providers wrapper / 클라이언트 사이드 프로바이더 래퍼
export default function ClientProviders({ children }: { children: React.ReactNode }) {
  useSuppressRechartsWarning();
  return (
    <LanguageProvider>
      <AccountProvider>
        {children}
      </AccountProvider>
    </LanguageProvider>
  );
}
