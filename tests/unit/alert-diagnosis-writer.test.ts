// Unit tests for src/lib/db/alert-diagnosis-writer.ts.
// ADR-030 Phase 1 dual-write — Aurora INSERT for alert_diagnosis (append-only,
// idempotent per incident via ON CONFLICT DO NOTHING).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockQuery = vi.fn();
const isAuroraEnabledMock = vi.fn(() => true);

vi.mock('@/lib/db', () => ({
  isAuroraEnabled: () => isAuroraEnabledMock(),
  getDb: async () => ({ query: mockQuery }),
}));

import {
  shadowSaveDiagnosis,
  fireAndForgetSaveDiagnosis,
  countAuroraDiagnoses,
} from '@/lib/db/alert-diagnosis-writer';
import { getDriftCounters, _resetForTests } from '@/lib/db/drift';
import type { Incident, AlertEvent, AlertSource, DiagnosisResult } from '@/lib/alert-types';

function makeAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: 'alert-1',
    source: 'cloudwatch' as AlertSource,
    alertName: 'HighCPU',
    severity: 'warning',
    status: 'firing',
    message: 'CPU high on i-1234',
    timestamp: '2026-05-27T10:00:00.000Z',
    labels: { service: 'api-server', namespace: 'prod' },
    annotations: {},
    rawPayload: {},
    receivedAt: '2026-05-27T10:00:01.000Z',
    ...overrides,
  };
}

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  const primary = makeAlert();
  return {
    id: 'inc-uuid-1',
    status: 'analyzed',
    createdAt: '2026-05-27T10:00:00.000Z',
    severity: 'warning',
    alerts: [primary],
    primaryAlert: primary,
    correlationReason: 'same service',
    affectedServices: ['api-server'],
    affectedResources: ['i-1234'],
    ...overrides,
  };
}

function makeResult(overrides: Partial<DiagnosisResult> = {}): DiagnosisResult {
  return {
    incidentId: 'inc-uuid-1',
    markdown: '# Diagnosis\n...',
    rootCause: 'EC2 throttled by CPU credits',
    rootCauseCategory: 'capacity',
    confidence: 'high',
    investigationSources: ['CloudWatch', 'Steampipe'],
    processingTimeMs: 4321,
    model: 'global.anthropic.claude-sonnet-4-6',
    inputTokens: 1000,
    outputTokens: 500,
    ...overrides,
  };
}

describe('alert-diagnosis-writer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    isAuroraEnabledMock.mockReturnValue(true);
    _resetForTests();
  });

  describe('shadowSaveDiagnosis', () => {
    it('no-ops silently when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      await shadowSaveDiagnosis(makeIncident(), makeResult());
      expect(mockQuery).not.toHaveBeenCalled();
      expect(getDriftCounters()).toEqual([]);
    });

    it('issues an INSERT with ON CONFLICT (incident_id) DO NOTHING (idempotent)', async () => {
      await shadowSaveDiagnosis(makeIncident(), makeResult());
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO alert_diagnosis/i);
      expect(sql).toMatch(/ON CONFLICT\s*\(\s*incident_id\s*\)\s*DO NOTHING/i);
    });

    it('maps incident fields to extracted columns', async () => {
      await shadowSaveDiagnosis(makeIncident(), makeResult());
      const [, params] = mockQuery.mock.calls[0];
      // Params: incident_id($1), occurred_at($2), severity($3), source($4),
      //         services($5), resources($6), fingerprint($7), payload($8)
      expect(params[0]).toBe('inc-uuid-1');
      expect(params[1]).toBeInstanceOf(Date);
      expect((params[1] as Date).toISOString()).toBe('2026-05-27T10:00:00.000Z');
      expect(params[2]).toBe('warning');
      expect(params[3]).toBe('cloudwatch');
      expect(params[4]).toEqual(['api-server']);
      expect(params[5]).toEqual(['i-1234']);
    });

    it('derives source from incident.alerts[0].source; defaults to "unknown" when empty', async () => {
      await shadowSaveDiagnosis(
        makeIncident({ alerts: [], affectedServices: [], affectedResources: [] }),
        makeResult(),
      );
      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBe('unknown');
    });

    it('passes incident.alerts[0].id (deterministic hash) into the fingerprint column', async () => {
      const a = makeAlert({ id: 'fp-abc' });
      await shadowSaveDiagnosis(makeIncident({ alerts: [a], primaryAlert: a }), makeResult());
      const [, params] = mockQuery.mock.calls[0];
      expect(params[6]).toBe('fp-abc');
    });

    it('writes null fingerprint when alerts list is empty', async () => {
      await shadowSaveDiagnosis(
        makeIncident({ alerts: [], affectedServices: [], affectedResources: [] }),
        makeResult(),
      );
      const [, params] = mockQuery.mock.calls[0];
      expect(params[6]).toBeNull();
    });

    it('builds the JSONB payload mirroring the DiagnosisRecord shape used by JSON storage', async () => {
      const result = makeResult({ rootCause: 'distinct-marker' });
      await shadowSaveDiagnosis(makeIncident(), result);
      const [, params] = mockQuery.mock.calls[0];
      const payload = JSON.parse(params[7]);
      expect(payload.incidentId).toBe('inc-uuid-1');
      expect(payload.timestamp).toBe('2026-05-27T10:00:00.000Z');
      expect(payload.rootCause).toBe('distinct-marker');
      expect(payload.alertNames).toEqual(['HighCPU']);
      expect(payload.affectedServices).toEqual(['api-server']);
      expect(payload.alertCount).toBe(1);
      expect(payload.diagnosisMarkdown).toBe('# Diagnosis\n...');
      // labels merged from all alerts
      expect(payload.labels).toMatchObject({ service: 'api-server', namespace: 'prod' });
    });

    it('increments drift writes counter on successful insert', async () => {
      await shadowSaveDiagnosis(makeIncident(), makeResult());
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'alert_diagnosis', writes: 1, failures: 0 });
    });

    it('increments drift failures and re-throws on INSERT failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('unique violation'));
      await expect(shadowSaveDiagnosis(makeIncident(), makeResult())).rejects.toThrow('unique violation');
      const snap = getDriftCounters();
      expect(snap[0]).toMatchObject({ source: 'alert_diagnosis', failures: 1 });
    });
  });

  describe('fireAndForgetSaveDiagnosis', () => {
    it('returns undefined synchronously', () => {
      expect(fireAndForgetSaveDiagnosis(makeIncident(), makeResult())).toBeUndefined();
    });

    it('does NOT propagate rejection but still records drift', async () => {
      mockQuery.mockRejectedValueOnce(new Error('boom'));
      expect(() => fireAndForgetSaveDiagnosis(makeIncident(), makeResult())).not.toThrow();
      await new Promise((r) => setImmediate(r));
      const snap = getDriftCounters();
      expect(snap[0].failures).toBe(1);
    });
  });

  describe('countAuroraDiagnoses', () => {
    it('returns 0 without querying when Aurora is not configured', async () => {
      isAuroraEnabledMock.mockReturnValue(false);
      const n = await countAuroraDiagnoses();
      expect(n).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns the row count from SELECT COUNT(*)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ c: '42' }], rowCount: 1 });
      const n = await countAuroraDiagnoses();
      expect(n).toBe(42);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/SELECT COUNT\(\*\).*FROM alert_diagnosis/i);
    });
  });
});
