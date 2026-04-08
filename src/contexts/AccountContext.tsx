'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

interface AccountInfo {
  accountId: string;
  alias: string;
  region: string;
  isHost?: boolean;
  features?: { costEnabled: boolean; eksEnabled: boolean; k8sEnabled: boolean };
}

interface AccountContextType {
  currentAccountId: string;  // '__all__' or 12-digit
  accounts: AccountInfo[];
  isMultiAccount: boolean;
  setCurrentAccountId: (id: string) => void;
  currentAccount: AccountInfo | undefined;
  getFeatures: () => { costEnabled: boolean; eksEnabled: boolean; k8sEnabled: boolean };
  refetchAccounts: () => Promise<void>;
  isDepartmentFiltered: boolean;  // true when departments config restricts this user
}

export const ALL_ACCOUNTS = '__all__';
const LS_KEY = 'awsops_current_account';

const defaultContext: AccountContextType = {
  currentAccountId: ALL_ACCOUNTS,
  accounts: [],
  isMultiAccount: false,
  setCurrentAccountId: () => {},
  currentAccount: undefined,
  getFeatures: () => ({ costEnabled: true, eksEnabled: true, k8sEnabled: true }),
  refetchAccounts: async () => {},
  isDepartmentFiltered: false,
};

const AccountContext = createContext<AccountContextType>(defaultContext);

export function useAccountContext() {
  return useContext(AccountContext);
}

export default function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [currentAccountId, setCurrentAccountIdState] = useState<string>(ALL_ACCOUNTS);
  const [isDepartmentFiltered, setIsDepartmentFiltered] = useState(false);

  const refetchAccounts = useCallback(async () => {
    try {
      // Fetch config and allowed accounts in parallel
      // config + 부서 허용 계정을 병렬로 조회
      const [configRes, allowedRes] = await Promise.all([
        fetch('/awsops/api/steampipe?action=config'),
        fetch('/awsops/api/steampipe?action=allowed-accounts'),
      ]);
      const config = await configRes.json();
      const { allowedAccountIds } = await allowedRes.json() as { allowedAccountIds: string[] | null };

      if (config.accounts && config.accounts.length > 0) {
        let fetched: AccountInfo[] = config.accounts.map((a: Record<string, unknown>) => ({
          accountId: a.accountId as string,
          alias: a.alias as string,
          region: a.region as string,
          isHost: a.isHost as boolean | undefined,
          features: a.features as { costEnabled: boolean; eksEnabled: boolean; k8sEnabled: boolean } | undefined,
        }));

        // Apply department filtering if configured / 부서 필터링 적용
        const filtered = allowedAccountIds !== null;
        setIsDepartmentFiltered(filtered);
        if (filtered) {
          fetched = fetched.filter(a => allowedAccountIds.includes(a.accountId));
        }

        setAccounts(fetched);
        setCurrentAccountIdState(prev => {
          // If department-filtered, don't allow ALL_ACCOUNTS / 부서 제한 시 "전체" 불가
          if (filtered && prev === ALL_ACCOUNTS) {
            const first = fetched[0]?.accountId || ALL_ACCOUNTS;
            try { localStorage.setItem(LS_KEY, first); } catch {}
            return first;
          }
          if (prev === ALL_ACCOUNTS) return prev;
          if (fetched.some(a => a.accountId === prev)) return prev;
          const fallback = filtered ? (fetched[0]?.accountId || ALL_ACCOUNTS) : ALL_ACCOUNTS;
          try { localStorage.setItem(LS_KEY, fallback); } catch {}
          return fallback;
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && (saved === ALL_ACCOUNTS || /^\d{12}$/.test(saved))) {
        setCurrentAccountIdState(saved);
      }
    } catch {}
    refetchAccounts();
  }, [refetchAccounts]);

  const setCurrentAccountId = useCallback((id: string) => {
    setCurrentAccountIdState(id);
    try { localStorage.setItem(LS_KEY, id); } catch {}
  }, []);

  const isMultiAccount = useMemo(() => accounts.length > 1, [accounts]);
  const currentAccount = useMemo(() => accounts.find(a => a.accountId === currentAccountId), [accounts, currentAccountId]);

  const getFeatures = useCallback(() => {
    if (!isMultiAccount) return { costEnabled: true, eksEnabled: true, k8sEnabled: true };
    if (currentAccountId === ALL_ACCOUNTS) {
      // Any account has the feature -> show it
      return {
        costEnabled: accounts.some(a => a.features?.costEnabled),
        eksEnabled: accounts.some(a => a.features?.eksEnabled),
        k8sEnabled: accounts.some(a => a.features?.k8sEnabled),
      };
    }
    return currentAccount?.features || { costEnabled: true, eksEnabled: true, k8sEnabled: true };
  }, [isMultiAccount, currentAccountId, accounts, currentAccount]);

  const contextValue = useMemo(() => ({
    currentAccountId, accounts, isMultiAccount, setCurrentAccountId, currentAccount, getFeatures, refetchAccounts, isDepartmentFiltered,
  }), [currentAccountId, accounts, isMultiAccount, setCurrentAccountId, currentAccount, getFeatures, refetchAccounts, isDepartmentFiltered]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
}
