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
