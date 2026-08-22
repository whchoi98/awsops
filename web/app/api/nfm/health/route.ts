import { verifyUser } from '@/lib/auth';
import { nfmStatus, nfmHealthSummary } from '@/lib/nfm';
import { NFM_RANGE_VALUES } from '@/lib/nfm-format';

export const dynamic = 'force-dynamic';

// NFM 상태 요약 밴드 — 모니터 1개의 CW 메트릭 요약 (GetMetricData 1콜 배치).
// monitor는 이름으로 받아 라이브 모니터 목록(allow-list)에서 ARN을 해석한다 —
// 클라이언트가 보낸 ARN을 신뢰하지 않는다.

export async function GET(request: Request) {
  if (!(await verifyUser(request.headers.get('cookie')))) {
    return Response.json({ status: 'error', message: 'unauthenticated' }, { status: 401 });
  }
  const url = new URL(request.url);
  const monitor = url.searchParams.get('monitor') ?? '';
  const rangeRaw = Number(url.searchParams.get('range') ?? 3600);
  const range = NFM_RANGE_VALUES.includes(rangeRaw) ? rangeRaw : 3600;

  // NFM API 자체 장애(ListMonitors 실패)는 404가 아니라 degrade — 404는 allow-list 거부 전용.
  const status = await nfmStatus().catch(() => null);
  if (!status) {
    return Response.json({ monitor, range, available: false, error: 'nfm status unavailable' });
  }
  const found = status.monitors.find((m) => m.name === monitor);
  if (!found?.arn) {
    return Response.json({ status: 'error', message: 'unknown monitor' }, { status: 404 });
  }
  try {
    const summary = await nfmHealthSummary(found.arn, range);
    return Response.json({ monitor, range, ...summary });
  } catch (e) {
    // CW 권한 부재/스로틀도 페이지가 "수집 전"을 그리도록 200 + available:false로 degrade.
    return Response.json({ monitor, range, available: false, error: e instanceof Error ? e.message : String(e) });
  }
}
