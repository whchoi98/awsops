import { verifyUser } from '@/lib/auth';
import { nfmStatus, NFM_METRICS, NFM_CATEGORIES } from '@/lib/nfm';

export const dynamic = 'force-dynamic';

// NFM 상태 (메뉴 게이트): 모니터 목록(EKS별/전체 VPC) + Scope 수 + UI 셀렉트용 enum.
// 모니터가 하나도 없으면 페이지가 온보딩 안내로 degrade (nfm-dashboard 온보딩 스택 참조).
export async function GET(request: Request) {
  if (!(await verifyUser(request.headers.get('cookie')))) {
    return Response.json({ status: 'error', message: 'unauthenticated' }, { status: 401 });
  }
  try {
    const status = await nfmStatus();
    // arn은 서버 내부용(health 라우트가 이름→ARN 해석) — 계정 ID가 포함되므로 클라이언트에 비노출.
    const monitors = status.monitors.map((m) => ({ name: m.name, status: m.status, cluster: m.cluster }));
    return Response.json({ monitors, scopeCount: status.scopeCount, metrics: NFM_METRICS, categories: NFM_CATEGORIES });
  } catch (e) {
    // 미온보딩/권한 부재도 페이지가 안내를 그리도록 200 + available:false 계열로 응답.
    return Response.json({ monitors: [], scopeCount: 0, metrics: NFM_METRICS, categories: NFM_CATEGORIES, error: e instanceof Error ? e.message : String(e) });
  }
}
