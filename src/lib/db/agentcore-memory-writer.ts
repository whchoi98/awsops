// ADR-030 Phase 1 dual-write — agentcore_memory Aurora INSERT.
//
// Source of truth during Phase 1 remains data/memory/conversations.json.
// This module shadows each saveConversation() call into Aurora so the 7-day
// parity gate (ADR-030) can verify before Phase 2 flips reads.
//
// Slice 5 granularity: one Aurora row per ConversationRecord (turn_index=0,
// role='assistant'). The schema natively supports per-turn rows, but the
// JSON layer summarizes a call as a single record — we mirror that 1-to-1
// to keep Phase 1 parity meaningful. Per-turn migration can happen
// independently once reads are cut over.
//
// expires_at uses the schema default (NOW() + 365 days) per ADR-018.
//
// Schema reference (infra-cdk/data/schema.sql):
//   user_sub, conversation_id, turn_index, role CHECK IN (...),
//   content JSONB, created_at, expires_at, UNIQUE (user_sub, conversation_id, turn_index).

import { getDb, isAuroraEnabled } from '@/lib/db';
import { recordWrite, recordFailure } from '@/lib/db/drift';
import type { ConversationRecord } from '@/lib/agentcore-memory';

const SOURCE = 'agentcore_memory';

const INSERT_SQL = `
  INSERT INTO agentcore_memory (
    user_sub, conversation_id, turn_index, role, content, created_at
  ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  ON CONFLICT (user_sub, conversation_id, turn_index) DO NOTHING
`;

const COUNT_SQL = `SELECT COUNT(*)::text AS c FROM agentcore_memory`;
const COUNT_BY_USER_SQL = `SELECT COUNT(*)::text AS c FROM agentcore_memory WHERE user_sub = $1`;

export async function shadowSaveConversation(record: ConversationRecord): Promise<void> {
  if (!isAuroraEnabled()) return;
  const userSub = record.userId || 'anonymous';
  const occurredAt = record.timestamp ? new Date(record.timestamp) : new Date();
  try {
    const db = await getDb();
    await db.query(INSERT_SQL, [
      userSub,
      record.id,
      0,
      'assistant',
      JSON.stringify(record),
      occurredAt,
    ]);
    recordWrite(SOURCE);
  } catch (err) {
    recordFailure(SOURCE, err);
    throw err;
  }
}

export function fireAndForgetSaveConversation(record: ConversationRecord): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  shadowSaveConversation(record).catch(() => {
    // Drift counter already incremented inside shadowSaveConversation.
  });
}

/**
 * Parity helper — total row count, or per-user count when user_sub is provided.
 */
export async function countAuroraMemory(userSub?: string): Promise<number> {
  if (!isAuroraEnabled()) return 0;
  const db = await getDb();
  const r = userSub
    ? await db.query<{ c: string }>(COUNT_BY_USER_SQL, [userSub])
    : await db.query<{ c: string }>(COUNT_SQL);
  return Number(r.rows[0]?.c ?? 0);
}
