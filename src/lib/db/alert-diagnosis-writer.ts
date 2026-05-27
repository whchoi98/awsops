// ADR-030 Phase 1 dual-write — alert_diagnosis Aurora INSERT (idempotent).
//
// Source of truth during Phase 1 remains data/alert-diagnosis/<YYYY-MM>/<id>.json.
// This module shadows each saveAlertDiagnosis() call into Aurora so the 7-day
// parity gate (ADR-030) can verify before Phase 2 flips reads.
//
// Mutation is append-per-incident: same incident_id arriving twice is a
// duplicate dispatch, not a new diagnosis. INSERT … ON CONFLICT (incident_id)
// DO NOTHING keeps the table idempotent.
//
// Schema reference (infra-cdk/data/schema.sql):
//   incident_id UNIQUE, occurred_at, severity, source, services TEXT[],
//   resources TEXT[], fingerprint, payload JSONB.

import { getDb, isAuroraEnabled } from '@/lib/db';
import { recordWrite, recordFailure } from '@/lib/db/drift';
import type { Incident, DiagnosisResult } from '@/lib/alert-types';

const SOURCE = 'alert_diagnosis';

const INSERT_SQL = `
  INSERT INTO alert_diagnosis (
    incident_id, occurred_at, severity, source,
    services, resources, fingerprint, payload
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
  ON CONFLICT (incident_id) DO NOTHING
`;

const COUNT_SQL = `SELECT COUNT(*)::text AS c FROM alert_diagnosis`;

function deriveAlertSource(incident: Incident): string {
  return incident.alerts[0]?.source ?? 'unknown';
}

function deriveFingerprint(incident: Incident): string | null {
  // AlertEvent.id is a deterministic hash of (source + alertName + labels);
  // collapse "" → null so the column is meaningfully searchable.
  const id = incident.alerts[0]?.id;
  return id ? id : null;
}

/**
 * Builds the JSONB payload — mirrors the DiagnosisRecord shape saved by
 * src/lib/alert-knowledge.ts so Phase 2 reads can swap source-of-truth
 * without app-side translation.
 */
function buildPayload(incident: Incident, result: DiagnosisResult) {
  const mergedLabels: Record<string, string> = {};
  for (const alert of incident.alerts) Object.assign(mergedLabels, alert.labels);
  return {
    incidentId: incident.id,
    timestamp: incident.createdAt,
    alertNames: incident.alerts.map((a) => a.alertName),
    severity: incident.severity,
    affectedServices: incident.affectedServices,
    affectedResources: incident.affectedResources,
    rootCause: result.rootCause,
    rootCauseCategory: result.rootCauseCategory,
    confidence: result.confidence,
    diagnosisMarkdown: result.markdown,
    investigationSources: result.investigationSources,
    processingTimeMs: result.processingTimeMs,
    alertCount: incident.alerts.length,
    labels: mergedLabels,
  };
}

export async function shadowSaveDiagnosis(
  incident: Incident,
  result: DiagnosisResult,
): Promise<void> {
  if (!isAuroraEnabled()) return;
  try {
    const db = await getDb();
    await db.query(INSERT_SQL, [
      incident.id,
      new Date(incident.createdAt),
      incident.severity,
      deriveAlertSource(incident),
      incident.affectedServices,
      incident.affectedResources,
      deriveFingerprint(incident),
      JSON.stringify(buildPayload(incident, result)),
    ]);
    recordWrite(SOURCE);
  } catch (err) {
    recordFailure(SOURCE, err);
    throw err;
  }
}

export function fireAndForgetSaveDiagnosis(
  incident: Incident,
  result: DiagnosisResult,
): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  shadowSaveDiagnosis(incident, result).catch(() => {
    // Drift counter already incremented inside shadowSaveDiagnosis.
  });
}

export async function countAuroraDiagnoses(): Promise<number> {
  if (!isAuroraEnabled()) return 0;
  const db = await getDb();
  const r = await db.query<{ c: string }>(COUNT_SQL);
  return Number(r.rows[0]?.c ?? 0);
}
