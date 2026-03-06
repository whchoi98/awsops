import type { LucideIcon } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface LiveResourceCardProps {
  title: string;
  status: string;
  stats: { label: string; value: string | number }[];
  icon: LucideIcon;
  color: string;
  lastChecked: string;
}

const colorMap: Record<string, { bg: string; text: string }> = {
  cyan:   { bg: 'bg-accent-cyan/10',   text: 'text-accent-cyan' },
  green:  { bg: 'bg-accent-green/10',  text: 'text-accent-green' },
  purple: { bg: 'bg-accent-purple/10', text: 'text-accent-purple' },
  orange: { bg: 'bg-accent-orange/10', text: 'text-accent-orange' },
  red:    { bg: 'bg-accent-red/10',    text: 'text-accent-red' },
  pink:   { bg: 'bg-accent-pink/10',   text: 'text-accent-pink' },
};

export default function LiveResourceCard({
  title,
  status,
  stats,
  icon: Icon,
  color,
  lastChecked,
}: LiveResourceCardProps) {
  const colors = colorMap[color] ?? colorMap.cyan;

  return (
    <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-md ${colors.bg}`}>
            <Icon size={22} className={colors.text} />
          </div>
          <h4 className="text-lg font-semibold text-white truncate">{title}</h4>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className="text-xl font-bold font-mono text-gray-200">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="text-[11px] text-gray-500">Last checked: {lastChecked}</p>
    </div>
  );
}
