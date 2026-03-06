'use client';

import { X } from 'lucide-react';

interface K9sDetailPanelProps {
  resource: any;
  type: string;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: any }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-accent-cyan shrink-0 w-28">{label}:</span>
      <span className="text-gray-300 break-all">{String(value)}</span>
    </div>
  );
}

export default function K9sDetailPanel({ resource, type, onClose }: K9sDetailPanelProps) {
  if (!resource) return null;

  const labels = resource.labels ?? resource.Labels ?? {};
  const containers = resource.containers ?? resource.Containers ?? [];
  const events = resource.events ?? resource.Events ?? [];

  return (
    <div className="fixed bottom-0 left-60 right-0 max-h-[50vh] bg-navy-800 border-t border-navy-600 z-40 flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-navy-700 border-b border-navy-600 shrink-0">
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-accent-cyan uppercase font-bold">{type}</span>
          <span className="text-gray-400">Describe</span>
          <span className="text-white">{resource.name ?? resource.Name ?? 'Unknown'}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-navy-600 text-gray-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-4">
        {/* Basic Info */}
        <section>
          <h4 className="text-accent-purple font-bold mb-1 uppercase text-[10px] tracking-wider">
            Metadata
          </h4>
          <div className="ml-2">
            <DetailRow label="Name" value={resource.name ?? resource.Name} />
            <DetailRow label="Namespace" value={resource.namespace ?? resource.Namespace} />
            <DetailRow label="Node" value={resource.node ?? resource.Node ?? resource.nodeName} />
            <DetailRow label="Status" value={resource.status ?? resource.Status ?? resource.phase} />
            <DetailRow label="IP" value={resource.ip ?? resource.IP ?? resource.podIP} />
          </div>
        </section>

        {/* Labels */}
        {Object.keys(labels).length > 0 && (
          <section>
            <h4 className="text-accent-purple font-bold mb-1 uppercase text-[10px] tracking-wider">
              Labels
            </h4>
            <div className="ml-2 flex flex-wrap gap-1.5">
              {Object.entries(labels).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-block px-2 py-0.5 bg-navy-700 rounded text-gray-400 border border-navy-600"
                >
                  <span className="text-accent-cyan">{k}</span>=
                  <span className="text-gray-300">{String(v)}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Containers */}
        {containers.length > 0 && (
          <section>
            <h4 className="text-accent-purple font-bold mb-1 uppercase text-[10px] tracking-wider">
              Containers
            </h4>
            <div className="ml-2 space-y-2">
              {containers.map((c: any, i: number) => (
                <div key={i} className="bg-navy-900 rounded border border-navy-600 p-2">
                  <DetailRow label="Name" value={c.name ?? c.Name} />
                  <DetailRow label="Image" value={c.image ?? c.Image} />
                  <DetailRow label="State" value={c.state ?? c.State ?? c.status} />
                  <DetailRow label="Restarts" value={c.restarts ?? c.restartCount} />
                  <DetailRow label="Ready" value={c.ready !== undefined ? String(c.ready) : undefined} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Events */}
        {events.length > 0 && (
          <section>
            <h4 className="text-accent-purple font-bold mb-1 uppercase text-[10px] tracking-wider">
              Events
            </h4>
            <div className="ml-2 space-y-1">
              {events.map((e: any, i: number) => (
                <div key={i} className="flex gap-2">
                  <span
                    className={`shrink-0 w-16 ${
                      (e.type ?? e.Type) === 'Warning'
                        ? 'text-accent-orange'
                        : 'text-gray-500'
                    }`}
                  >
                    {e.type ?? e.Type ?? 'Normal'}
                  </span>
                  <span className="text-gray-500 shrink-0 w-24">
                    {e.reason ?? e.Reason ?? ''}
                  </span>
                  <span className="text-gray-400">
                    {e.message ?? e.Message ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
