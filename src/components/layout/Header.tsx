'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
}

export default function Header({ title, subtitle, onRefresh }: HeaderProps) {
  const [spinning, setSpinning] = useState(false);
  const [lastUpdated] = useState(() => new Date().toLocaleTimeString());

  const handleRefresh = () => {
    if (!onRefresh) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-navy-600 bg-navy-800/80 backdrop-blur-sm">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500 font-mono">
          Last updated: {lastUpdated}
        </span>

        {onRefresh && (
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-navy-700 border border-navy-600 text-gray-400 hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              size={16}
              className={spinning ? 'animate-spin' : ''}
            />
          </button>
        )}

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          ONLINE
        </span>
      </div>
    </header>
  );
}
