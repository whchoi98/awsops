'use client';
import { useEffect, useState } from 'react';
import { Gauge, HeartPulse, Repeat2, TimerOff } from 'lucide-react';
import StatTile from '@/components/ui/StatTile';
import { useI18n } from '@/components/shell/LanguageProvider';
import { formatMicros } from '@/lib/nfm-format';
import type { NfmHealthPoint, NfmHealthSummary } from '@/lib/nfm';

// 상태 요약 밴드 — 선택 모니터의 CW 메트릭 요약 (GET /api/nfm/health, 모니터·기간
// 변경 시 재조회). 판정 우선순위: HealthIndicator(AWS망 이슈 여부) > Timeouts(0 여부)
// > RTT·재전송. RTT·재전송은 절대값이 아닌 스파크라인 추세가 본질 — µs 절대값은
// 직관이 없다(콘솔 실측: 대부분 <100µs). 무데이터는 "수집 전"으로 정직 표시.

function Sparkline({ points }: { points: NfmHealthPoint[] }) {
  if (points.length < 2) return null;
  const w = 96; const h = 22; const pad = 1.5;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs); const span = Math.max(...vs) - min || 1;
  const pts = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p.v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-ink-300" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface HealthResp extends Partial<NfmHealthSummary> { error?: string }

export default function HealthBand({ monitor, range }: { monitor: string; range: number }) {
  const { tt } = useI18n();
  const [health, setHealth] = useState<HealthResp | null>(null);

  useEffect(() => {
    if (!monitor) return;
    let alive = true;
    setHealth(null);
    fetch(`/api/nfm/health?monitor=${encodeURIComponent(monitor)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: HealthResp) => { if (alive) setHealth(d); })
      .catch(() => { if (alive) setHealth({ available: false }); });
    return () => { alive = false; };
  }, [monitor, range]);

  if (!health) return null; // 로딩 중 — 도착 후 렌더 (이전 모니터 값 오표시 방지)

  const degraded = health.degraded ?? null;
  const timeouts = health.timeouts ?? null;
  const retx = health.retransmissions ?? null;
  const rttAvgUs = health.rttAvgUs ?? null;
  const series = health.series;
  const notYet = tt('수집 전');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 종합 판정은 HealthIndicator 전담(AWS 자체 판정 지표) — Timeouts는 자기 타일의
          숫자·색으로만 신호한다. 합계>0을 종합 판정에 올리면 실환경 배경 소음(시간당 수 건)
          에도 경고로 뒤집혀 과민해진다는 결정 (2026-08-04, #2 검증 피드백). */}
      <StatTile
        label="네트워크 상태"
        value={degraded == null ? notYet : degraded ? tt('AWS망 이슈') : tt('정상')}
        variant={degraded == null ? 'default' : degraded ? 'danger' : 'accent'}
        hint={monitor}
        icon={<HeartPulse size={16} />}
      />
      <StatTile
        label="타임아웃"
        value={timeouts == null ? notYet : Math.round(timeouts).toLocaleString()}
        variant={timeouts != null && timeouts > 0 ? 'danger' : 'default'}
        hint={tt('기간 내 연결 타임아웃 합계')}
        icon={<TimerOff size={16} />}
      />
      <StatTile
        label="RTT (평균)"
        value={rttAvgUs == null ? notYet : formatMicros(rttAvgUs)}
        hint={series ? <Sparkline points={series.rtt} /> : undefined}
        icon={<Gauge size={16} />}
      />
      <StatTile
        label="재전송"
        value={retx == null ? notYet : Math.round(retx).toLocaleString()}
        hint={series ? <Sparkline points={series.retransmissions} /> : undefined}
        icon={<Repeat2 size={16} />}
      />
    </div>
  );
}
