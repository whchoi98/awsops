'use client';

import { useAccountContext } from '@/contexts/AccountContext';

const COLORS = ['cyan', 'green', 'purple', 'orange', 'pink'] as const;
const COLOR_CLASSES: Record<string, string> = {
  cyan: 'bg-accent-cyan/10 text-accent-cyan',
  green: 'bg-accent-green/10 text-accent-green',
  purple: 'bg-accent-purple/10 text-accent-purple',
  orange: 'bg-accent-orange/10 text-accent-orange',
  pink: 'bg-accent-pink/10 text-accent-pink',
};

export default function AccountBadge({ id }: { id: string }) {
  const { accounts } = useAccountContext();
  const idx = accounts.findIndex(a => a.accountId === id);
  const account = accounts[idx];
  const color = COLORS[Math.max(idx, 0) % COLORS.length];

  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-mono ${COLOR_CLASSES[color] || COLOR_CLASSES.cyan}`}>
      {account?.alias || id.slice(-4)}
    </span>
  );
}
