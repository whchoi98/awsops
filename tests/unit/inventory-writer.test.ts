// Unit tests for src/lib/db/inventory-writer.ts.
// ADR-030 Phase 1 dual-write — Aurora INSERT for inventory_snapshots
// (DELETE-then-INSERT per (account, day) so a re-run of saveSnapshot
// stays idempotent).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockQuery = vi.fn();
const isAuroraEnabledMock = vi.fn(() => true);

vi.mock('@/lib/db', () => ({
  isAuroraEnabled: () => isAuroraEnabledMock(),
  getDb: async () => ({ query: mockQuery }),
}));

import {
  shadowSaveInventorySnapshot,
  fireAndForgetSaveInventorySnapshot,
  countAuroraInventoryRows,
} from '@/lib/db/inventory-writer';
import { getDriftCounters, _resetForTests } from '@/lib/db/drift';
import type { InventorySnapshot } from '@/lib/resource-inventory';

function makeSnapshot(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    date: '2026-05-27',
    timestamp: '2026-05-27T01:00:00.000Z',
    resources: {
      'EC2 Instances': 12,
      'S3 Buckets': 47,
      'Lambda Functions': 8,
    },
    ...overrides,
  };
}

describe('inventory-writer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    isAuroraEnabledMock.mockReturnValue(true);
    _resetForTests();
  });

  describe('shadowSaveInventorySnapshot', () => {
    it('no-ops silently when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      await shadowSaveInventorySnapshot(makeSnapshot(), '111111111111');
      expect(mockQuery).not.toHaveBeenCalled();
      expect(getDriftCounters()).toEqual([]);
    });

    it('issues a DELETE for that (account_id, day) before inserting (idempotent re-runs)', async () => {
      await shadowSaveInventorySnapshot(makeSnapshot(), '111111111111');
      const deleteCall = mockQuery.mock.calls.find(([s]) =>
        /DELETE FROM inventory_snapshots/i.test(s),
      );
      expect(deleteCall).toBeDefined();
      const [sql, params] = deleteCall!;
      expect(sql).toMatch(/WHERE account_id\s*=\s*\$1/i);
      expect(sql).toMatch(/captured_at\s*>=\s*\$2/i);
      expect(sql).toMatch(/captured_at\s*<\s*\$3/i);
      expect(params[0]).toBe('111111111111');
    });

    it('inserts one row per resource entry in the snapshot', async () => {
      await shadowSaveInventorySnapshot(makeSnapshot(), '111111111111');
      const insertCalls = mockQuery.mock.calls.filter(([s]) =>
        /INSERT INTO inventory_snapshots/i.test(s),
      );
      expect(insertCalls).toHaveLength(3);
    });

    it('maps each (resource_type, count) pair to the extracted columns', async () => {
      await shadowSaveInventorySnapshot(
        makeSnapshot({ resources: { 'EC2 Instances': 12 } }),
        '111111111111',
      );
      const insertCall = mockQuery.mock.calls.find(([s]) =>
        /INSERT INTO inventory_snapshots/i.test(s),
      );
      const [, params] = insertCall!;
      // Params: account_id($1), captured_at($2), resource_type($3),
      //         resource_count($4), payload($5)
      expect(params[0]).toBe('111111111111');
      expect(params[1]).toBeInstanceOf(Date);
      expect((params[1] as Date).toISOString()).toBe('2026-05-27T01:00:00.000Z');
      expect(params[2]).toBe('EC2 Instances');
      expect(params[3]).toBe(12);
    });

    it('skips when accountId is missing (no account context, no row)', async () => {
      await shadowSaveInventorySnapshot(makeSnapshot(), undefined);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('uses "aggregate" as account_id when accountId is the literal "aws" aggregator key', async () => {
      await shadowSaveInventorySnapshot(makeSnapshot(), 'aws');
      const insertCall = mockQuery.mock.calls.find(([s]) =>
        /INSERT INTO inventory_snapshots/i.test(s),
      );
      const [, params] = insertCall!;
      expect(params[0]).toBe('aggregate');
    });

    it('increments drift writes counter once per saved snapshot (not per resource)', async () => {
      await shadowSaveInventorySnapshot(makeSnapshot(), '111111111111');
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'inventory_snapshots', writes: 1, failures: 0 });
    });

    it('increments drift failures and re-throws when any INSERT fails', async () => {
      // First DELETE OK, first INSERT OK, second INSERT fails.
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT 1
        .mockRejectedValueOnce(new Error('serialization failure')); // INSERT 2
      await expect(
        shadowSaveInventorySnapshot(makeSnapshot(), '111111111111'),
      ).rejects.toThrow('serialization failure');
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'inventory_snapshots', failures: 1 });
    });
  });

  describe('fireAndForgetSaveInventorySnapshot', () => {
    it('returns undefined synchronously', () => {
      expect(fireAndForgetSaveInventorySnapshot(makeSnapshot(), '111111111111')).toBeUndefined();
    });

    it('does NOT propagate rejection but still records drift', async () => {
      mockQuery.mockRejectedValueOnce(new Error('boom'));
      expect(() => fireAndForgetSaveInventorySnapshot(makeSnapshot(), '111111111111')).not.toThrow();
      await new Promise((r) => setImmediate(r));
      const snap = getDriftCounters();
      expect(snap[0].failures).toBe(1);
    });
  });

  describe('countAuroraInventoryRows', () => {
    it('returns 0 without querying when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      const n = await countAuroraInventoryRows();
      expect(n).toBe(0);
    });

    it('returns the total row count by default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '24' }], rowCount: 1 });
      const n = await countAuroraInventoryRows();
      expect(n).toBe(24);
    });

    it('counts distinct (account_id, day) snapshots when distinct=true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '7' }], rowCount: 1 });
      const n = await countAuroraInventoryRows({ distinct: true });
      expect(n).toBe(7);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/COUNT\(DISTINCT/i);
    });
  });
});
