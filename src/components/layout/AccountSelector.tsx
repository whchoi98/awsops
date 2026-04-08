'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccountContext, ALL_ACCOUNTS } from '@/contexts/AccountContext';

export default function AccountSelector() {
  const { currentAccountId, accounts, setCurrentAccountId, isDepartmentFiltered } = useAccountContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Static class map to prevent Tailwind purge issues with dynamic classes
  const COLOR_BG: Record<string, string> = {
    host: 'bg-green-400',
    target: 'bg-cyan-400',
    purple: 'bg-purple-400',
    orange: 'bg-orange-400',
  };

  if (accounts.length === 0) return null;

  const current = currentAccountId === ALL_ACCOUNTS
    ? { alias: 'All Accounts', accountId: ALL_ACCOUNTS, isHost: false }
    : accounts.find(a => a.accountId === currentAccountId) || { alias: 'All Accounts', accountId: ALL_ACCOUNTS, isHost: false };

  return (
    <div ref={ref} className="relative px-3 mb-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-700 border border-navy-600 hover:bg-navy-600 transition-colors text-sm"
      >
        {currentAccountId === ALL_ACCOUNTS ? (
          <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path strokeWidth="1.5" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
          </svg>
        ) : (
          <span className={`w-2 h-2 rounded-full shrink-0 ${current.isHost ? COLOR_BG.host : COLOR_BG.target}`} />
        )}
        <span className="truncate text-gray-200">{current.alias}</span>
        <svg className={`w-3 h-3 ml-auto shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div role="listbox" className="absolute left-3 right-3 mt-1 py-1 bg-navy-700 border border-navy-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {/* Hide "All Accounts" when department filtering is active / 부서 필터링 시 "전체" 숨김 */}
          {!isDepartmentFiltered && (
            <>
              <button
                role="option"
                aria-selected={currentAccountId === ALL_ACCOUNTS}
                onClick={() => { setCurrentAccountId(ALL_ACCOUNTS); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-navy-600 transition-colors ${currentAccountId === ALL_ACCOUNTS ? 'text-cyan-400' : 'text-gray-300'}`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                  <path strokeWidth="1.5" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
                </svg>
                <span>All Accounts</span>
              </button>
              <div className="border-t border-navy-600 my-1" />
            </>
          )}
          {accounts.map(acc => (
            <button
              role="option"
              aria-selected={currentAccountId === acc.accountId}
              key={acc.accountId}
              onClick={() => { setCurrentAccountId(acc.accountId); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-navy-600 transition-colors ${currentAccountId === acc.accountId ? 'text-cyan-400' : 'text-gray-300'}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${acc.isHost ? COLOR_BG.host : COLOR_BG.target}`} />
              <span className="truncate">{acc.alias}</span>
              <span className="text-gray-500 text-xs ml-auto shrink-0">...{acc.accountId.slice(-4)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
