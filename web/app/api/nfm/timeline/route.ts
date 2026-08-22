import { verifyUser } from '@/lib/auth';
import { nfmFleetTimeline, nfmMonitorCoverage } from '@/lib/nfm';
import { NFM_TIMELINE_VALUES } from '@/lib/nfm-format';

export const dynamic = 'force-dynamic';

// 모니터별 추이 차트 — 전 모니터 × 5메트릭 CW GetMetricData 배치 (lib/nfm.ts).
// health 라우트와 같은 계약: ARN은 서버에서만 해석·비노출, NFM/CW 실패는 200 degrade.
// range는 타임라인 프리셋(1h~7d) allow-list — 쿼리 패널의 1h 캡과 무관한 CW 경로.

export async function GET(request: Request) {
  if (!(await verifyUser(request.headers.get('cookie')))) {
    return Response.json({ status: 'error', message: 'unauthenticated' }, { status: 401 });
  }
  const url = new URL(request.url);
  const rangeRaw = Number(url.searchParams.get('range') ?? 86400);
  const range = NFM_TIMELINE_VALUES.includes(rangeRaw) ? rangeRaw : 86400;
  try {
    // coverage(모니터 감시 대상)는 부가 정보 — 실패해도 타임라인을 죽이지 않는다.
    const [timeline, coverage] = await Promise.all([
      nfmFleetTimeline(range),
      nfmMonitorCoverage().catch(() => ({})),
    ]);
    return Response.json({ ...timeline, coverage });
  } catch (e) {
    // NFM ListMonitors/CW 실패 — 페이지가 "수집 전"을 그리도록 200 + available:false.
    return Response.json({
      available: false, rangeSec: range, periodSec: 0, monitors: [], series: {},
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
