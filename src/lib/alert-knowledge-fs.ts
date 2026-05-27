// JSON-side count helper for alert diagnosis records.
//
// Kept separate from src/lib/alert-knowledge.ts so the parity endpoint and
// future cutover tooling can read just the count without pulling in the
// full save/summary machinery (and so unit tests can mock this surface
// independently of the rest of the alert pipeline).

import { existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const BASE_DIR = resolve(process.cwd(), 'data/alert-diagnosis');

/**
 * Counts JSON-side diagnosis records under data/alert-diagnosis/<YYYY-MM>/*.json.
 * Excludes the per-month summary.json. Returns 0 if the directory does not
 * exist yet (fresh install / no incidents yet).
 */
export function countJsonDiagnoses(): number {
  if (!existsSync(BASE_DIR)) return 0;
  let total = 0;
  for (const monthDir of readdirSync(BASE_DIR)) {
    const dirPath = join(BASE_DIR, monthDir);
    let files: string[];
    try {
      files = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith('.json') && f !== 'summary.json') total++;
    }
  }
  return total;
}
