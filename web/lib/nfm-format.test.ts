import { describe, it, expect } from 'vitest';
import { formatMicros } from './nfm-format';

// CW의 RoundTripTime은 µs 단위 (콘솔 실측: min 25µs, 대부분 <100µs).
// v2 monitor 쿼리 폴백(Milliseconds)과 단위가 달라 1000배 함정 — 표시 변환은 이 모듈 한 곳.
describe('formatMicros', () => {
  it('keeps sub-millisecond values in µs (typical NFM RTT range)', () => {
    expect(formatMicros(25)).toBe('25 µs');
    expect(formatMicros(999)).toBe('999 µs');
  });

  it('promotes to ms from 1,000 µs', () => {
    expect(formatMicros(1000)).toBe('1.0 ms');
    expect(formatMicros(1500)).toBe('1.5 ms');
    expect(formatMicros(25_300)).toBe('25.3 ms');
  });

  it('promotes to s from 1,000,000 µs', () => {
    expect(formatMicros(1_000_000)).toBe('1.0 s');
    expect(formatMicros(2_500_000)).toBe('2.5 s');
  });

  it('rounds µs to integers', () => {
    expect(formatMicros(25.6)).toBe('26 µs');
  });
});

describe('buildTimelineRows', () => {
  const pts = (vals: [number, number][]) => vals.map(([t, v]) => ({ t, v }));

  it('unions timestamps across monitors and pivots to one row per bucket', async () => {
    const { buildTimelineRows } = await import('./nfm-format');
    const rows = buildTimelineRows({
      a: pts([[1000, 5], [2000, 7]]),
      b: pts([[2000, 1], [3000, 2]]),
    });
    expect(rows).toEqual([
      { t: 1000, a: 5, b: null },
      { t: 2000, a: 7, b: 1 },
      { t: 3000, a: null, b: 2 },
    ]);
  });

  it('applies a scale factor (e.g. bytes → MB)', async () => {
    const { buildTimelineRows } = await import('./nfm-format');
    const rows = buildTimelineRows({ a: pts([[1000, 2_000_000]]) }, { scale: 1 / 1e6 });
    expect(rows).toEqual([{ t: 1000, a: 2 }]);
  });

  it('normalizes per GB against the transfer series, null when transfer is missing or 0', async () => {
    const { buildTimelineRows } = await import('./nfm-format');
    const rows = buildTimelineRows(
      { a: pts([[1000, 10], [2000, 10], [3000, 10]]) },
      { perGbBy: { a: pts([[1000, 2e9], [2000, 0]]) } }, // 3000 버킷은 transfer 무데이터
    );
    expect(rows).toEqual([
      { t: 1000, a: 5 },      // 10건 / 2GB
      { t: 2000, a: null },   // 0GB — 나눗셈 불능
      { t: 3000, a: null },   // transfer 무데이터
    ]);
  });
});

describe('formatTimelineTick', () => {
  it('shows time-of-day for ranges within a day, date+time beyond', async () => {
    const { formatTimelineTick } = await import('./nfm-format');
    const t = new Date('2026-08-19T05:42:00Z').getTime();
    expect(formatTimelineTick(t, 3600)).toMatch(/^\d{2}:\d{2}$/);
    expect(formatTimelineTick(t, 604800)).toMatch(/^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  });
});

describe('rowStats', () => {
  it('computes max/mean/last per monitor column, ignoring null buckets', async () => {
    const { rowStats } = await import('./nfm-format');
    const rows = [
      { t: 1, a: 10, b: null },
      { t: 2, a: null, b: 4 },
      { t: 3, a: 20, b: 2 },
    ];
    expect(rowStats(rows, 'a')).toEqual({ max: 20, mean: 15, last: 20 });
    expect(rowStats(rows, 'b')).toEqual({ max: 4, mean: 3, last: 2 });
  });

  it('returns null when the column has no numeric values', async () => {
    const { rowStats } = await import('./nfm-format');
    expect(rowStats([{ t: 1, a: null }], 'a')).toBeNull();
    expect(rowStats([], 'a')).toBeNull();
  });
});
