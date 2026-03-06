interface NodeInfo {
  name: string;
  cpu_capacity: number;
  memory_capacity: number;
  cpu_percent?: number;
  memory_percent?: number;
}

interface K9sClusterHeaderProps {
  context: string;
  nodes: NodeInfo[];
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const color =
    percent > 80 ? 'bg-accent-red' : percent > 60 ? 'bg-accent-orange' : 'bg-accent-green';

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-gray-500 w-10 shrink-0">{label}</span>
      <div className="progress-bar flex-1 h-2 bg-navy-600 rounded-full overflow-hidden">
        <div
          className={`progress-fill h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="text-gray-400 w-10 text-right">{percent.toFixed(0)}%</span>
    </div>
  );
}

export default function K9sClusterHeader({ context, nodes }: K9sClusterHeaderProps) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg p-4 font-mono">
      {/* Context Info */}
      <div className="flex items-center gap-3 mb-3 text-sm">
        <span className="text-accent-cyan">ctx:</span>
        <span className="text-white">{context}</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-500">
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Node Stats */}
      <div className="space-y-2">
        {nodes.map((node) => (
          <div
            key={node.name}
            className="bg-navy-900 rounded border border-navy-600 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-accent-green">{node.name}</span>
              <span className="text-[10px] text-gray-600">
                {node.cpu_capacity} vCPU / {node.memory_capacity} MiB
              </span>
            </div>
            <div className="space-y-1.5">
              <ProgressBar
                label="CPU"
                percent={node.cpu_percent ?? 0}
              />
              <ProgressBar
                label="MEM"
                percent={node.memory_percent ?? 0}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
