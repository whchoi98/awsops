'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, Check, Settings } from 'lucide-react';
import { useAccountContext } from '@/contexts/AccountContext';

const ALL_ACCOUNTS = '__all__';
const ACCOUNT_COLORS = ['cyan', 'green', 'purple', 'orange', 'pink'] as const;
const COLOR_BG: Record<string, string> = {
  cyan: 'bg-accent-cyan', green: 'bg-accent-green', purple: 'bg-accent-purple',
  orange: 'bg-accent-orange', pink: 'bg-accent-pink',
};

export default function AccountSelector() {
  const { currentAccountId, setCurrentAccountId, accounts, isMultiAccount } = useAccountContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isMultiAccount) return null;

  const currentLabel = currentAccountId === ALL_ACCOUNTS
    ? 'All Accounts'
    : accounts.find(a => a.accountId === currentAccountId)?.alias || currentAccountId.slice(-4);

  const currentColor = currentAccountId === ALL_ACCOUNTS
    ? 'cyan'
    : ACCOUNT_COLORS[accounts.findIndex(a => a.accountId === currentAccountId) % ACCOUNT_COLORS.length];

  return (
    <div ref={ref} className="px-3 py-2 border-b border-navy-600">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-700/50 border border-navy-600 text-sm text-gray-300 hover:border-accent-cyan/50 hover:text-white transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${COLOR_BG[currentColor] || 'bg-accent-cyan'}`} />
        <span className="flex-1 text-left truncate text-xs">{currentLabel}</span>
        {currentAccountId === ALL_ACCOUNTS && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan">
            {accounts.length}
          </span>
        )}
        <ChevronDown size={12} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 rounded-lg bg-navy-900 border border-navy-600 shadow-xl py-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => { setCurrentAccountId(ALL_ACCOUNTS); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-navy-700 transition-colors ${
              currentAccountId === ALL_ACCOUNTS ? 'text-accent-cyan' : 'text-gray-300'
            }`}
          >
            <Building2 size={12} />
            <span className="flex-1">All Accounts</span>
            <span className="text-[9px] text-gray-500">{accounts.length}</span>
            {currentAccountId === ALL_ACCOUNTS && <Check size={12} className="text-accent-cyan" />}
          </button>

          <div className="border-t border-navy-700 my-0.5" />

          {accounts.map((account, idx) => {
            const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
            const isSelected = currentAccountId === account.accountId;
            return (
              <button
                key={account.accountId}
                onClick={() => { setCurrentAccountId(account.accountId); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-navy-700 transition-colors ${
                  isSelected ? 'text-accent-cyan' : 'text-gray-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${COLOR_BG[color] || 'bg-accent-cyan'}`} />
                <span className="flex-1 truncate">{account.alias}</span>
                <span className="text-[9px] text-gray-600 font-mono">{account.accountId.slice(-4)}</span>
                {isSelected && <Check size={12} className="text-accent-cyan" />}
              </button>
            );
          })}

          <div className="border-t border-navy-700 my-0.5" />
          <button
            onClick={() => { setOpen(false); router.push('/accounts'); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-navy-700 transition-colors"
          >
            <Settings size={12} />
            <span>Manage Accounts</span>
          </button>
        </div>
      )}
    </div>
  );
}
