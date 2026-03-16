'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { AccountConfig, AccountFeatures } from '@/lib/app-config';

const ALL_ACCOUNTS = '__all__';

interface AccountContextValue {
  currentAccountId: string;
  setCurrentAccountId: (id: string) => void;
  accounts: AccountConfig[];
  isMultiAccount: boolean;
  getFeatures: () => AccountFeatures;
  refreshAccounts: () => void;
}

const defaultFeatures: AccountFeatures = { costEnabled: true, eksEnabled: true, k8sEnabled: true };

const AccountContext = createContext<AccountContextValue>({
  currentAccountId: ALL_ACCOUNTS,
  setCurrentAccountId: () => {},
  accounts: [],
  isMultiAccount: false,
  getFeatures: () => defaultFeatures,
  refreshAccounts: () => {},
});

export function useAccountContext() {
  return useContext(AccountContext);
}

export default function AccountProvider({ children }: { children: React.ReactNode }) {
  const [currentAccountId, setCurrentAccountIdState] = useState(ALL_ACCOUNTS);
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);

  const refreshAccounts = useCallback(() => {
    fetch('/awsops/api/steampipe?action=accounts')
      .then(r => r.json())
      .then(data => {
        const accts: AccountConfig[] = data.accounts || [];
        setAccounts(accts);
        const saved = localStorage.getItem('awsops-account');
        if (saved && accts.find(a => a.accountId === saved)) {
          setCurrentAccountIdState(saved);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshAccounts(); }, [refreshAccounts]);

  const setCurrentAccountId = useCallback((id: string) => {
    setCurrentAccountIdState(id);
    localStorage.setItem('awsops-account', id);
  }, []);

  const isMultiAccount = accounts.length > 1;

  const getFeatures = useCallback((): AccountFeatures => {
    if (!accounts.length) return defaultFeatures;
    if (currentAccountId === ALL_ACCOUNTS) {
      return {
        costEnabled: accounts.some(a => a.features.costEnabled),
        eksEnabled: accounts.some(a => a.features.eksEnabled),
        k8sEnabled: accounts.some(a => a.features.k8sEnabled),
      };
    }
    const account = accounts.find(a => a.accountId === currentAccountId);
    return account?.features || { costEnabled: false, eksEnabled: false, k8sEnabled: false };
  }, [accounts, currentAccountId]);

  const value = useMemo(() => ({
    currentAccountId,
    setCurrentAccountId,
    accounts,
    isMultiAccount,
    getFeatures,
    refreshAccounts,
  }), [currentAccountId, setCurrentAccountId, accounts, isMultiAccount, getFeatures, refreshAccounts]);

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}
