'use client';
import { useI18n } from '@/components/shell/LanguageProvider';
import { localeOf } from '@/lib/i18n';

// v1 노드 상세 3분할 카드 (CPU / Memory / Pod Info) — 스택 바는 Capacity 기준
// [Requested | Available(=Allocatable-Requested) | Reserved(=Capacity-Allocatable)] 3분할.
interface Props {
  cpuCapacity: number; cpuAllocatable: number; cpuRequest: number;
  memCapacityMiB: number; memAllocatableMiB: number; memRequestMiB: number;
  podCIDR?: string; podCount: number; podRunning: number; podPending: number; podFailed: number;
  createdAt?: string;
}

const gib = (mib: number) => (mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${Math.round(mib)} MiB`);

function StackBar({ requested, allocatable, capacity }: { requested: number; allocatable: number; capacity: number }) {
  if (!(capacity > 0)) return null;
  const req = Math.min(requested, allocatable);
  const avail = Math.max(0, allocatable - req);
  const reserved = Math.max(0, capacity - allocatable);
  const pct = (v: number) => `${(v / capacity) * 100}%`;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <span className="h-full bg-brand-500" style={{ width: pct(req) }} title={`Requested ${((req / capacity) * 100).toFixed(0)}%`} />
        <span className="h-full bg-emerald-400/70" style={{ width: pct(avail) }} title={`Available ${((avail / capacity) * 100).toFixed(0)}%`} />
        <span className="h-full bg-ink-300" style={{ width: pct(reserved) }} title={`System-Reserved ${((reserved / capacity) * 100).toFixed(0)}%`} />
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10.5px] text-ink-400">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-500" />Requested</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-400/70" />Available</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ink-300" />Reserved</span>
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between text-[12px]">
    <span className="text-ink-400">{label}</span>
    <span className="tabular font-medium text-ink-700">{value}</span>
  </div>
);

export default function NodeCapacityCards(raw: Props) {
  const { lang } = useI18n();
  // 방어적 정규화 — 노드 API가 일부 값을 안 주는 경우(테스트 픽스처 포함) 0으로 강제.
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const p = {
    ...raw,
    cpuCapacity: n(raw.cpuCapacity), cpuAllocatable: n(raw.cpuAllocatable), cpuRequest: n(raw.cpuRequest),
    memCapacityMiB: n(raw.memCapacityMiB), memAllocatableMiB: n(raw.memAllocatableMiB), memRequestMiB: n(raw.memRequestMiB),
  };
  const cpuAvail = Math.max(0, p.cpuAllocatable - p.cpuRequest);
  const memAvail = Math.max(0, p.memAllocatableMiB - p.memRequestMiB);
  const card = 'rounded-lg border border-ink-100 bg-paper-muted/40 p-3 flex flex-col gap-1.5';
  const h = 'text-[11px] font-semibold text-ink-700';
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className={card}>
        <div className={h}>CPU</div>
        <Row label="Capacity" value={`${p.cpuCapacity.toFixed(1)} vCPU`} />
        <Row label="Allocatable" value={`${p.cpuAllocatable.toFixed(1)} (${p.cpuCapacity > 0 ? ((p.cpuAllocatable / p.cpuCapacity) * 100).toFixed(0) : 0}%)`} />
        <Row label="Pod Requested" value={`${p.cpuRequest.toFixed(2)} (${p.cpuAllocatable > 0 ? ((p.cpuRequest / p.cpuAllocatable) * 100).toFixed(0) : 0}%)`} />
        <Row label="Available" value={`${cpuAvail.toFixed(2)} vCPU`} />
        <StackBar requested={p.cpuRequest} allocatable={p.cpuAllocatable} capacity={p.cpuCapacity} />
      </div>
      <div className={card}>
        <div className={h}>Memory</div>
        <Row label="Capacity" value={gib(p.memCapacityMiB)} />
        <Row label="Allocatable" value={`${gib(p.memAllocatableMiB)} (${p.memCapacityMiB > 0 ? ((p.memAllocatableMiB / p.memCapacityMiB) * 100).toFixed(0) : 0}%)`} />
        <Row label="Pod Requested" value={`${gib(p.memRequestMiB)} (${p.memAllocatableMiB > 0 ? ((p.memRequestMiB / p.memAllocatableMiB) * 100).toFixed(0) : 0}%)`} />
        <Row label="Available" value={gib(memAvail)} />
        <StackBar requested={p.memRequestMiB} allocatable={p.memAllocatableMiB} capacity={p.memCapacityMiB} />
      </div>
      <div className={card}>
        <div className={h}>Pod Info</div>
        <Row label="Pod CIDR" value={p.podCIDR ?? '—'} />
        <Row label="Total Pods" value={String(p.podCount)} />
        <Row label="Running / Pending / Failed" value={`${p.podRunning} / ${p.podPending} / ${p.podFailed}`} />
        <Row label="Created" value={p.createdAt ? new Date(p.createdAt).toLocaleString(localeOf(lang)) : '—'} />
      </div>
    </div>
  );
}
