// NFM 표시 단위 변환 — AWS SDK 무의존(클라이언트 컴포넌트에서 import 가능).
// CW의 RoundTripTime은 µs 단위(콘솔 실측: min 25µs, 대부분 <100µs)인 반면 monitor
// 쿼리 폴백 unit은 Milliseconds — 1000배 함정. µs 변환·표시는 이 모듈 한 곳에만 둔다.

// NFM 조회 기간 프리셋 — monitor 쿼리 1h 한도(NFM_MAX_RANGE_SEC)에 맞춘 enum.
// 쿼리 패널(RangePicker)과 상태 요약 밴드 라우트가 같은 값을 공유한다 (이중 정의 방지).
export const NFM_RANGE_PRESETS = [['15m', 900], ['30m', 1800], ['1h', 3600]] as const;
export const NFM_RANGE_VALUES: readonly number[] = NFM_RANGE_PRESETS.map(([, sec]) => sec);

/** µs 값을 적응형 단위(µs → ms → s)로 표시. */
export function formatMicros(us: number): string {
  if (us < 1000) return `${Math.round(us)} µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)} ms`;
  return `${(us / 1_000_000).toFixed(1)} s`;
}
