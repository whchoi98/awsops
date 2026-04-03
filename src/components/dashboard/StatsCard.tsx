import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  change?: string;
  highlight?: boolean; // Apply color to value text / 값 텍스트에 색상 적용
  href?: string;       // Click to navigate / 클릭 시 이동
}

const colorMap: Record<string, { bg: string; text: string }> = {
  cyan: { bg: 'bg-accent-cyan/10', text: 'text-accent-cyan' },
  green: { bg: 'bg-accent-green/10', text: 'text-accent-green' },
  purple: { bg: 'bg-accent-purple/10', text: 'text-accent-purple' },
  orange: { bg: 'bg-accent-orange/10', text: 'text-accent-orange' },
  red: { bg: 'bg-accent-red/10', text: 'text-accent-red' },
  pink: { bg: 'bg-accent-pink/10', text: 'text-accent-pink' },
};

export default function StatsCard({ label, value, icon: Icon, color, change, highlight, href }: StatsCardProps) {
  const colors = colorMap[color] ?? colorMap.cyan;

  const content = (
    <div className={`bg-navy-800 rounded-lg border border-navy-600 p-5 relative overflow-hidden h-full${href ? ' cursor-pointer hover:border-accent-cyan/30 transition-colors' : ''}`}>
      {/* Icon */}
      <div className={`absolute top-4 right-4 p-2.5 rounded-lg ${colors.bg}`}>
        <Icon size={20} className={colors.text} />
      </div>

      {/* Content — auto-size for long values / 긴 값은 자동 축소 */}
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className={`font-bold font-mono truncate ${String(value).length > 8 ? 'text-2xl' : 'text-3xl'} ${highlight ? colors.text : 'text-white'}`}>{value}</p>

      {change && (
        <p
          className={`text-xs mt-2 ${
            change.startsWith('+') || change.startsWith('✓')
              ? 'text-accent-green'
              : change.startsWith('-') || change.startsWith('⚠')
              ? 'text-accent-red'
              : /\d+\s+(Public|Open|Unencrypted)/i.test(change)
              ? 'text-accent-orange'
              : 'text-gray-500'
          }`}
        >
          {change}
        </p>
      )}
    </div>
  );

  if (href) return <Link href={href} className="block">{content}</Link>;
  return content;
}
