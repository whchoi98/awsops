// Unit tests for src/lib/db/cost-writer.ts.
// ADR-030 Phase 1 dual-write — Aurora UPSERT for cost_snapshots.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockQuery = vi.fn();
const isAuroraEnabledMock = vi.fn(() => true);

vi.mock('@/lib/db', () => ({
  isAuroraEnabled: () => isAuroraEnabledMock(),
  getDb: async () => ({ query: mockQuery }),
}));

import {
  shadowSaveCostSnapshot,
  fireAndForgetSaveCostSnapshot,
  countAuroraCostSnapshots,
} from '@/lib/db/cost-writer';
import { getDriftCounters, _resetForTests } from '@/lib/db/drift';
import type { CostSnapshot } from '@/lib/cost-snapshot';

function makeSnapshot(overrides: Partial<CostSnapshot> = {}): CostSnapshot {
  return {
    date: '2026-05-27',
    timestamp: '2026-05-27T01:00:00.000Z',
    monthlyCost: [{ period: '2026-05', total: '1234.56' }],
    dailyCost: [{ date: '2026-05-26', total: '40.12' }],
    serviceCost: [{ service: 'EC2', total: '800.00' }],
    ...overrides,
  };
}

describe('cost-writer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    isAuroraEnabledMock.mockReturnValue(true);
    _resetForTests();
  });

  describe('shadowSaveCostSnapshot', () => {
    it('no-ops silently when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      await shadowSaveCostSnapshot(makeSnapshot(), '111111111111');
      expect(mockQuery).not.toHaveBeenCalled();
      expect(getDriftCounters()).toEqual([]);
    });

    it('issues an INSERT … ON CONFLICT (account, period_start, period_end, granularity) DO UPDATE', async () => {
      await shadowSaveCostSnapshot(makeSnapshot(), '111111111111');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO cost_snapshots/i);
      expect(sql).toMatch(/ON CONFLICT\s*\(\s*account_id,\s*period_start,\s*period_end,\s*granularity\s*\)\s*DO UPDATE/i);
    });

    it('maps snapshot.date to both period_start and period_end (single-day window)', async () => {
      await shadowSaveCostSnapshot(makeSnapshot({ date: '2026-05-27' }), '111111111111');
      const [, params] = mockQuery.mock.calls[0];
      // Params: account_id($1), period_start($2), period_end($3),
      //         granularity($4), payload($5)
      expect(params[0]).toBe('111111111111');
      expect(params[1]).toBe('2026-05-27');
      expect(params[2]).toBe('2026-05-27');
      expect(params[3]).toBe('SNAPSHOT');
    });

    it('packages monthlyCost + dailyCost + serviceCost into the JSONB payload', async () => {
      const snap = makeSnapshot({
        monthlyCost: [{ period: '2026-05', total: '1234' }],
        dailyCost: [{ date: '2026-05-26', total: '40' }],
        serviceCost: [{ service: 'S3', total: '15' }],
      });
      await shadowSaveCostSnapshot(snap, '111111111111');
      const [, params] = mockQuery.mock.calls[0];
      const payload = JSON.parse(params[4]);
      expect(payload.monthlyCost).toEqual(snap.monthlyCost);
      expect(payload.dailyCost).toEqual(snap.dailyCost);
      expect(payload.serviceCost).toEqual(snap.serviceCost);
      expect(payload.capturedAt).toBe(snap.timestamp);
    });

    it('skips when accountId is missing (no account context)', async () => {
      await shadowSaveCostSnapshot(makeSnapshot(), undefined);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('remaps the `aws` Steampipe aggregator key to `aggregate`', async () => {
      await shadowSaveCostSnapshot(makeSnapshot(), 'aws');
      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('aggregate');
    });

    it('increments drift writes counter on successful upsert', async () => {
      await shadowSaveCostSnapshot(makeSnapshot(), '111111111111');
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'cost_snapshots', writes: 1, failures: 0 });
    });

    it('increments drift failures and re-throws on UPSERT failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection lost'));
      await expect(shadowSaveCostSnapshot(makeSnapshot(), '111111111111')).rejects.toThrow('connection lost');
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'cost_snapshots', failures: 1 });
    });
  });

  describe('fireAndForgetSaveCostSnapshot', () => {
    it('returns undefined synchronously', () => {
      expect(fireAndForgetSaveCostSnapshot(makeSnapshot(), '111111111111')).toBeUndefined();
    });

    it('does NOT propagate rejection but still records drift', async () => {
      mockQuery.mockRejectedValueOnce(new Error('boom'));
      expect(() => fireAndForgetSaveCostSnapshot(makeSnapshot(), '111111111111')).not.toThrow();
      await new Promise((r) => setImmediate(r));
      const snap = getDriftCounters();
      expect(snap[0].failures).toBe(1);
    });
  });

  describe('countAuroraCostSnapshots', () => {
    it('returns 0 without querying when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      const n = await countAuroraCostSnapshots();
      expect(n).toBe(0);
    });

    it('returns the row count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '9' }], rowCount: 1 });
      const n = await countAuroraCostSnapshots();
      expect(n).toBe(9);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/SELECT COUNT\(\*\).*FROM cost_snapshots/i);
    });
  });
});
