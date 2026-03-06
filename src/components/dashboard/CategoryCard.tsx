import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface CategoryCardProps {
  title: string;
  icon: LucideIcon;
  stats: { label: string; value: string | number }[];
  status: string;
  href: string;
}

export default function CategoryCard({ title, icon: Icon, stats, status, href }: CategoryCardProps) {
  return (
    <Link href={href} className="block group">
      <div className="bg-navy-800 rounded-lg border border-navy-600 p-5 transition-all hover:border-accent-cyan/60 hover:shadow-lg hover:shadow-accent-cyan/5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-cyan/10">
              <Icon size={20} className="text-accent-cyan" />
            </div>
            <h3 className="text-white font-semibold">{title}</h3>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-xs text-gray-500 mb-0.5">{stat.label}</p>
              <p className="text-sm font-mono text-gray-200">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
