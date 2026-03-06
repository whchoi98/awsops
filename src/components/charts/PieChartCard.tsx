'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const DEFAULT_COLORS = ['#00d4ff', '#00ff88', '#a855f7', '#f59e0b', '#ef4444', '#ec4899'];

interface PieChartCardProps {
  title: string;
  data: { name: string; value: number; color?: string }[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400">{item.name}</p>
      <p className="text-sm font-mono text-white font-semibold">{item.value}</p>
    </div>
  );
}

export default function PieChartCard({ title, data }: PieChartCardProps) {
  return (
    <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={entry.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor:
                  entry.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
              }}
            />
            <span className="text-xs text-gray-400">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
