'use client';

interface Column {
  key: string;
  label: string;
}

interface K9sResourceTableProps {
  columns: Column[];
  data: any[];
  onSelect: (row: any, index: number) => void;
  selectedRow?: number;
}

const statusColors: Record<string, string> = {
  running: 'text-accent-green',
  ready: 'text-accent-green',
  active: 'text-accent-green',
  succeeded: 'text-accent-green',
  healthy: 'text-accent-green',
  pending: 'text-yellow-400',
  creating: 'text-yellow-400',
  containercreating: 'text-yellow-400',
  failed: 'text-accent-red',
  error: 'text-accent-red',
  crashloopbackoff: 'text-accent-red',
  imagepullbackoff: 'text-accent-red',
  completed: 'text-accent-cyan',
  terminating: 'text-gray-500',
  terminated: 'text-gray-500',
  unknown: 'text-gray-500',
};

function getStatusColor(value: any): string {
  if (typeof value !== 'string') return '';
  const key = value.toLowerCase().replace(/[\s-_]/g, '');
  return statusColors[key] ?? '';
}

export default function K9sResourceTable({
  columns,
  data,
  onSelect,
  selectedRow,
}: K9sResourceTableProps) {
  return (
    <div className="k9s-terminal bg-navy-900 rounded-lg border border-navy-600 overflow-hidden font-mono text-xs">
      {/* Header */}
      <div className="flex bg-navy-700 px-3 py-2 gap-1">
        {columns.map((col) => (
          <div
            key={col.key}
            className="flex-1 text-accent-cyan uppercase font-bold tracking-wider truncate"
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-navy-700/50">
        {data.map((row, i) => {
          const isSelected = selectedRow === i;
          return (
            <div
              key={i}
              onClick={() => onSelect(row, i)}
              className={`
                k9s-row flex px-3 py-1.5 cursor-pointer transition-colors gap-1
                ${
                  isSelected
                    ? 'k9s-row-selected bg-navy-700 border-l-2 border-accent-cyan'
                    : 'hover:bg-navy-800 border-l-2 border-transparent'
                }
              `}
            >
              {columns.map((col) => {
                const value = row[col.key];
                const colorClass = getStatusColor(value);
                return (
                  <div
                    key={col.key}
                    className={`flex-1 truncate ${colorClass || 'text-gray-300'}`}
                  >
                    {value ?? '-'}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {data.length === 0 && (
        <div className="px-3 py-6 text-center text-gray-600">
          No resources found
        </div>
      )}
    </div>
  );
}
