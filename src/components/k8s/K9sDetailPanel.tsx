'use client';

import { X, Loader2 } from 'lucide-react';

interface K9sDetailPanelProps {
  resource: any;
  type: string;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: any }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-accent-cyan shrink-0 w-32">{label}:</span>
      <span className="text-gray-300 break-all">{String(value)}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-accent-purple font-bold mb-1 uppercase text-[10px] tracking-wider">
      {title}
    </h4>
  );
}

function KeyValueBadges({ data }: { data: Record<string, any> }) {
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div className="ml-2 flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-block px-2 py-0.5 bg-navy-700 rounded text-gray-400 border border-navy-600"
        >
          <span className="text-accent-cyan">{k}</span>=
          <span className="text-gray-300">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

export default function K9sDetailPanel({ resource, type, onClose }: K9sDetailPanelProps) {
  if (!resource) return null;

  const isLoading = resource._loading === true;
  const labels = resource.labels ?? {};
  const annotations = resource.annotations ?? {};
  const containers = resource.containers ?? [];
  const initContainers = resource.init_containers ?? [];
  const volumes = resource.volumes ?? [];
  const conditions = resource.conditions ?? [];
  const tolerations = resource.tolerations ?? [];
  const nodeSelector = resource.node_selector ?? {};
  const ownerRefs = resource.owner_references ?? [];
  const ports = resource.ports ?? [];
  const selector = resource.selector;
  const strategy = resource.strategy;

  const hasLabels = typeof labels === 'object' && Object.keys(labels).length > 0;
  const hasAnnotations = typeof annotations === 'object' && Object.keys(annotations).length > 0;
  const hasContainers = Array.isArray(containers) && containers.length > 0;
  const hasInitContainers = Array.isArray(initContainers) && initContainers.length > 0;
  const hasVolumes = Array.isArray(volumes) && volumes.length > 0;
  const hasConditions = Array.isArray(conditions) && conditions.length > 0;
  const hasTolerations = Array.isArray(tolerations) && tolerations.length > 0;
  const hasNodeSelector = typeof nodeSelector === 'object' && Object.keys(nodeSelector).length > 0;
  const hasOwnerRefs = Array.isArray(ownerRefs) && ownerRefs.length > 0;
  const hasPorts = Array.isArray(ports) && ports.length > 0;

  return (
    <div className="fixed bottom-0 left-60 right-0 max-h-[50vh] bg-navy-800 border-t border-navy-600 z-40 flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-navy-700 border-b border-navy-600 shrink-0">
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-accent-cyan uppercase font-bold">{type}</span>
          <span className="text-gray-400">Describe</span>
          <span className="text-white">{resource.name ?? 'Unknown'}</span>
          {isLoading && <Loader2 size={12} className="animate-spin text-accent-cyan" />}
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
        {/* Metadata */}
        <section>
          <SectionHeader title="Metadata" />
          <div className="ml-2">
            <DetailRow label="Name" value={resource.name} />
            <DetailRow label="Namespace" value={resource.namespace} />
            <DetailRow label="Node" value={resource.node_name} />
            <DetailRow label="Status" value={resource.phase ?? resource.status} />
            <DetailRow label="Pod IP" value={resource.pod_ip} />
            <DetailRow label="Host IP" value={resource.host_ip} />
            <DetailRow label="QoS Class" value={resource.qos_class} />
            <DetailRow label="Priority" value={resource.priority} />
            <DetailRow label="DNS Policy" value={resource.dns_policy} />
            <DetailRow label="Restart Policy" value={resource.restart_policy} />
            <DetailRow label="Service Account" value={resource.service_account_name} />
            <DetailRow label="Service Name" value={resource.service_name} />
            <DetailRow label="Cluster IP" value={resource.cluster_ip} />
            <DetailRow label="External IP" value={resource.external_ip} />
            <DetailRow label="Type" value={resource.type} />
            <DetailRow label="Replicas" value={resource.replicas} />
            <DetailRow label="Ready" value={resource.ready_replicas} />
            <DetailRow label="Available" value={resource.available_replicas} />
            <DetailRow label="Created" value={resource.creation_timestamp} />
            <DetailRow label="Context" value={resource.context_name} />
          </div>
        </section>

        {/* Labels */}
        {hasLabels && (
          <section>
            <SectionHeader title="Labels" />
            <KeyValueBadges data={labels} />
          </section>
        )}

        {/* Annotations */}
        {hasAnnotations && (
          <section>
            <SectionHeader title="Annotations" />
            <KeyValueBadges data={annotations} />
          </section>
        )}

        {/* Owner References */}
        {hasOwnerRefs && (
          <section>
            <SectionHeader title="Owner References" />
            <div className="ml-2 space-y-1">
              {ownerRefs.map((ref: any, i: number) => (
                <div key={i} className="flex gap-3 text-gray-400">
                  <span className="text-accent-cyan">{ref.kind}</span>
                  <span className="text-gray-300">{ref.name}</span>
                  {ref.controller && <span className="text-accent-green text-[10px]">controller</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Selector */}
        {selector && typeof selector === 'object' && Object.keys(selector).length > 0 && (
          <section>
            <SectionHeader title="Selector" />
            <KeyValueBadges data={typeof selector === 'object' && selector.match_labels ? selector.match_labels : selector} />
          </section>
        )}

        {/* Strategy (Deployments) */}
        {strategy && (
          <section>
            <SectionHeader title="Strategy" />
            <div className="ml-2">
              {typeof strategy === 'object' ? (
                <>
                  <DetailRow label="Type" value={strategy.type} />
                  {strategy.rolling_update && (
                    <>
                      <DetailRow label="Max Unavailable" value={strategy.rolling_update.max_unavailable} />
                      <DetailRow label="Max Surge" value={strategy.rolling_update.max_surge} />
                    </>
                  )}
                </>
              ) : (
                <DetailRow label="Type" value={String(strategy)} />
              )}
            </div>
          </section>
        )}

        {/* Ports (Services) */}
        {hasPorts && (
          <section>
            <SectionHeader title="Ports" />
            <div className="ml-2">
              <table className="text-[10px]">
                <thead>
                  <tr className="text-gray-500">
                    <th className="pr-4 text-left font-normal">NAME</th>
                    <th className="pr-4 text-left font-normal">PROTOCOL</th>
                    <th className="pr-4 text-left font-normal">PORT</th>
                    <th className="pr-4 text-left font-normal">TARGET</th>
                    <th className="pr-4 text-left font-normal">NODEPORT</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p: any, i: number) => (
                    <tr key={i} className="text-gray-300">
                      <td className="pr-4">{p.name || '-'}</td>
                      <td className="pr-4">{p.protocol || 'TCP'}</td>
                      <td className="pr-4">{p.port}</td>
                      <td className="pr-4">{p.target_port ?? p.targetPort ?? '-'}</td>
                      <td className="pr-4">{p.node_port ?? p.nodePort ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Conditions */}
        {hasConditions && (
          <section>
            <SectionHeader title="Conditions" />
            <div className="ml-2">
              <table className="text-[10px]">
                <thead>
                  <tr className="text-gray-500">
                    <th className="pr-4 text-left font-normal">TYPE</th>
                    <th className="pr-4 text-left font-normal">STATUS</th>
                    <th className="pr-4 text-left font-normal">REASON</th>
                    <th className="text-left font-normal">MESSAGE</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map((c: any, i: number) => (
                    <tr key={i} className="text-gray-300">
                      <td className="pr-4 text-accent-cyan">{c.type}</td>
                      <td className={`pr-4 ${c.status === 'True' ? 'text-accent-green' : c.status === 'False' ? 'text-red-400' : 'text-gray-400'}`}>
                        {c.status}
                      </td>
                      <td className="pr-4">{c.reason || '-'}</td>
                      <td className="text-gray-400 max-w-md truncate">{c.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Init Containers */}
        {hasInitContainers && (
          <section>
            <SectionHeader title="Init Containers" />
            <div className="ml-2 space-y-2">
              {initContainers.map((c: any, i: number) => (
                <div key={i} className="bg-navy-900 rounded border border-navy-600 p-2">
                  <DetailRow label="Name" value={c.name} />
                  <DetailRow label="Image" value={c.image} />
                  {c.command && <DetailRow label="Command" value={Array.isArray(c.command) ? c.command.join(' ') : c.command} />}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Containers */}
        {hasContainers && (
          <section>
            <SectionHeader title="Containers" />
            <div className="ml-2 space-y-2">
              {containers.map((c: any, i: number) => {
                const res = c.resources ?? {};
                const requests = res.requests ?? {};
                const limits = res.limits ?? {};
                const cPorts = c.ports ?? [];
                const vMounts = c.volume_mounts ?? c.volumeMounts ?? [];
                return (
                  <div key={i} className="bg-navy-900 rounded border border-navy-600 p-2 space-y-1">
                    <DetailRow label="Name" value={c.name} />
                    <DetailRow label="Image" value={c.image} />
                    {c.command && <DetailRow label="Command" value={Array.isArray(c.command) ? c.command.join(' ') : c.command} />}
                    {c.args && <DetailRow label="Args" value={Array.isArray(c.args) ? c.args.join(' ') : c.args} />}
                    {(requests.cpu || requests.memory) && (
                      <DetailRow label="Requests" value={`CPU: ${requests.cpu || '-'}, Memory: ${requests.memory || '-'}`} />
                    )}
                    {(limits.cpu || limits.memory) && (
                      <DetailRow label="Limits" value={`CPU: ${limits.cpu || '-'}, Memory: ${limits.memory || '-'}`} />
                    )}
                    {cPorts.length > 0 && (
                      <DetailRow label="Ports" value={cPorts.map((p: any) => `${p.container_port ?? p.containerPort}/${p.protocol || 'TCP'}`).join(', ')} />
                    )}
                    {c.liveness_probe && <DetailRow label="Liveness" value={probeString(c.liveness_probe)} />}
                    {c.readiness_probe && <DetailRow label="Readiness" value={probeString(c.readiness_probe)} />}
                    {vMounts.length > 0 && (
                      <div className="mt-1">
                        <span className="text-gray-500 text-[10px]">Volume Mounts:</span>
                        <div className="ml-2">
                          {vMounts.map((vm: any, vi: number) => (
                            <div key={vi} className="text-gray-400 text-[10px]">
                              {vm.name} → {vm.mount_path ?? vm.mountPath}
                              {(vm.read_only ?? vm.readOnly) && <span className="text-accent-orange ml-1">(ro)</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Volumes */}
        {hasVolumes && (
          <section>
            <SectionHeader title="Volumes" />
            <div className="ml-2 space-y-1">
              {volumes.map((v: any, i: number) => {
                const src = v.config_map ? `ConfigMap: ${v.config_map.name}`
                  : v.secret ? `Secret: ${v.secret.secret_name ?? v.secret.secretName}`
                  : v.persistent_volume_claim ? `PVC: ${v.persistent_volume_claim.claim_name ?? v.persistent_volume_claim.claimName}`
                  : v.empty_dir ? 'EmptyDir'
                  : v.host_path ? `HostPath: ${v.host_path.path}`
                  : v.projected ? 'Projected'
                  : v.downward_api ? 'DownwardAPI'
                  : JSON.stringify(Object.keys(v).filter(k => k !== 'name'));
                return (
                  <div key={i} className="flex gap-2 text-gray-400">
                    <span className="text-accent-cyan w-40 shrink-0">{v.name}</span>
                    <span className="text-gray-300">{src}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Node Selector */}
        {hasNodeSelector && (
          <section>
            <SectionHeader title="Node Selector" />
            <KeyValueBadges data={nodeSelector} />
          </section>
        )}

        {/* Tolerations */}
        {hasTolerations && (
          <section>
            <SectionHeader title="Tolerations" />
            <div className="ml-2 space-y-1">
              {tolerations.map((t: any, i: number) => (
                <div key={i} className="text-gray-400 text-[10px]">
                  {t.key ? (
                    <span>
                      <span className="text-accent-cyan">{t.key}</span>
                      {t.operator === 'Equal' ? `=${t.value}` : ` (${t.operator || 'Exists'})`}
                      :{t.effect || '*'}
                      {t.toleration_seconds != null && ` for ${t.toleration_seconds}s`}
                    </span>
                  ) : (
                    <span className="text-gray-500">operator: {t.operator || 'Exists'} (match all)</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function probeString(probe: any): string {
  if (!probe) return '';
  if (probe.http_get) {
    const hg = probe.http_get;
    return `HTTP GET ${hg.path || '/'}:${hg.port || ''} (delay=${probe.initial_delay_seconds ?? 0}s, period=${probe.period_seconds ?? 10}s)`;
  }
  if (probe.tcp_socket) {
    return `TCP :${probe.tcp_socket.port} (delay=${probe.initial_delay_seconds ?? 0}s, period=${probe.period_seconds ?? 10}s)`;
  }
  if (probe.exec) {
    const cmd = probe.exec.command;
    return `Exec: ${Array.isArray(cmd) ? cmd.join(' ') : cmd || ''}`;
  }
  return JSON.stringify(probe);
}
