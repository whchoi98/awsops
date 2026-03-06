import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  change?: string;
}

const colorMap: Record<string, { bg: string; text: string }> = {
  cyan: { bg: 'bg-accent-cyan/10', text: 'text-accent-cyan' },
  green: { bg: 'bg-accent-green/10', text: 'text-accent-green' },
  purple: { bg: 'bg-accent-purple/10', text: 'text-accent-purple' },
  orange: { bg: 'bg-accent-orange/10', text: 'text-accent-orange' },
  red: { bg: 'bg-accent-red/10', text: 'text-accent-red' },
  pink: { bg: 'bg-accent-pink/10', text: 'text-accent-pink' },
};

export default function StatsCard({ label, value, icon: Icon, color, change }: StatsCardProps) {
  const colors = colorMap[color] ?? colorMap.cyan;

  return (
    <div className="bg-navy-800 rounded-lg border border-navy-600 p-5 relative overflow-hidden">
      {/* Icon */}
      <div className={`absolute top-4 right-4 p-2.5 rounded-lg ${colors.bg}`}>
        <Icon size={20} className={colors.text} />
      </div>

      {/* Content */}
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-white font-mono">{value}</p>

      {change && (
        <p
          className={`text-xs mt-2 ${
            change.startsWith('+')
              ? 'text-accent-green'
              : change.startsWith('-')
              ? 'text-accent-red'
              : 'text-gray-500'
          }`}
        >
          {change}
        </p>
      )}
    </div>
  );
}
