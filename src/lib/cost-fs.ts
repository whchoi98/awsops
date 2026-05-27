// JSON-side counter for cost snapshots.
//
// Counts distinct (account, day) cost-snapshot files under data/cost/.
// Separate from cost-snapshot.ts so the parity endpoint mocks cleanly.

import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const DATA_DIR = resolve(process.cwd(), 'data/cost');

export function countJsonCostSnapshots(): number {
  if (!existsSync(DATA_DIR)) return 0;
  let total = 0;
  for (const entry of readdirSync(DATA_DIR)) {
    const p = join(DATA_DIR, entry);
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        for (const f of readdirSync(p)) {
          if (f.endsWith('.json')) total++;
        }
      } else if (st.isFile() && entry.endsWith('.json') && !entry.startsWith('.')) {
        total++;
      }
    } catch {
      /* skip */
    }
  }
  return total;
}
