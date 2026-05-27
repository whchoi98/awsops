// Unit tests for src/lib/db/agentcore-memory-writer.ts.
// ADR-030 Phase 1 dual-write — Aurora UPSERT for agentcore_memory.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockQuery = vi.fn();
const isAuroraEnabledMock = vi.fn(() => true);

vi.mock('@/lib/db', () => ({
  isAuroraEnabled: () => isAuroraEnabledMock(),
  getDb: async () => ({ query: mockQuery }),
}));

import {
  shadowSaveConversation,
  fireAndForgetSaveConversation,
  countAuroraMemory,
} from '@/lib/db/agentcore-memory-writer';
import { getDriftCounters, _resetForTests } from '@/lib/db/drift';
import type { ConversationRecord } from '@/lib/agentcore-memory';

function makeRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: 'conv-1716800000000',
    userId: 'user-abc',
    timestamp: '2026-05-27T10:00:00.000Z',
    route: 'network',
    gateway: 'network-gateway',
    question: 'Why is VPC peering broken?',
    summary: 'Subnet route table missing entry for peer CIDR.',
    usedTools: ['describe-route-tables', 'describe-vpc-peering'],
    responseTimeMs: 2345,
    via: 'bedrock-opus',
    ...overrides,
  };
}

describe('agentcore-memory-writer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    isAuroraEnabledMock.mockReturnValue(true);
    _resetForTests();
  });

  describe('shadowSaveConversation', () => {
    it('no-ops silently when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      await shadowSaveConversation(makeRecord());
      expect(mockQuery).not.toHaveBeenCalled();
      expect(getDriftCounters()).toEqual([]);
    });

    it('issues an INSERT … ON CONFLICT DO NOTHING (idempotent on the UQ key)', async () => {
      await shadowSaveConversation(makeRecord());
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO agentcore_memory/i);
      expect(sql).toMatch(/ON CONFLICT\s*\(\s*user_sub,\s*conversation_id,\s*turn_index\s*\)\s*DO NOTHING/i);
    });

    it('maps record fields to the schema columns', async () => {
      await shadowSaveConversation(makeRecord({
        id: 'conv-9',
        userId: 'alice',
        timestamp: '2026-05-27T10:00:00.000Z',
      }));
      const [, params] = mockQuery.mock.calls[0];
      // Params: user_sub($1), conversation_id($2), turn_index($3),
      //         role($4), content($5), created_at($6)
      expect(params[0]).toBe('alice');
      expect(params[1]).toBe('conv-9');
      expect(params[2]).toBe(0);
      expect(params[3]).toBe('assistant');
      expect(params[5]).toBeInstanceOf(Date);
      expect((params[5] as Date).toISOString()).toBe('2026-05-27T10:00:00.000Z');
    });

    it('serializes the full ConversationRecord into the content JSONB', async () => {
      const rec = makeRecord({ usedTools: ['x', 'y'], summary: 'distinct-summary' });
      await shadowSaveConversation(rec);
      const [, params] = mockQuery.mock.calls[0];
      const content = JSON.parse(params[4]);
      expect(content.summary).toBe('distinct-summary');
      expect(content.usedTools).toEqual(['x', 'y']);
      expect(content.gateway).toBe(rec.gateway);
      expect(content.route).toBe(rec.route);
    });

    it('uses "anonymous" as user_sub when record.userId is empty', async () => {
      await shadowSaveConversation(makeRecord({ userId: '' }));
      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('anonymous');
    });

    it('increments drift writes counter on successful upsert', async () => {
      await shadowSaveConversation(makeRecord());
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'agentcore_memory', writes: 1, failures: 0 });
    });

    it('increments drift failures and re-throws on INSERT failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection lost'));
      await expect(shadowSaveConversation(makeRecord())).rejects.toThrow('connection lost');
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'agentcore_memory', failures: 1 });
    });
  });

  describe('fireAndForgetSaveConversation', () => {
    it('returns undefined synchronously', () => {
      expect(fireAndForgetSaveConversation(makeRecord())).toBeUndefined();
    });

    it('does NOT propagate rejection but still records drift', async () => {
      mockQuery.mockRejectedValueOnce(new Error('boom'));
      expect(() => fireAndForgetSaveConversation(makeRecord())).not.toThrow();
      await new Promise((r) => setImmediate(r));
      const snap = getDriftCounters();
      expect(snap[0].failures).toBe(1);
    });
  });

  describe('countAuroraMemory', () => {
    it('returns 0 without querying when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      const n = await countAuroraMemory();
      expect(n).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns the total row count by default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '17' }], rowCount: 1 });
      const n = await countAuroraMemory();
      expect(n).toBe(17);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/SELECT COUNT\(\*\).*FROM agentcore_memory/i);
    });

    it('filters by user_sub when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '4' }], rowCount: 1 });
      const n = await countAuroraMemory('alice');
      expect(n).toBe(4);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/WHERE user_sub\s*=\s*\$1/i);
      expect(params).toEqual(['alice']);
    });
  });
});
