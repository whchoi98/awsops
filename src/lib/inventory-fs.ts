// JSON-side counter for inventory snapshots.
//
// Counts distinct (account, day) snapshot files under data/inventory/.
// Kept separate from src/lib/resource-inventory.ts so the parity endpoint
// can mock this surface without pulling in the full snapshot machinery.

import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const DATA_DIR = resolve(process.cwd(), 'data/inventory');

/**
 * Counts distinct (account, day) snapshot files. Inventory is stored as
 *   data/inventory/<account>/<YYYY-MM-DD>.json
 * with the root (data/inventory/<YYYY-MM-DD>.json) acting as the aggregate
 * snapshot in multi-account deployments.
 */
export function countJsonInventoryDays(): number {
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
        // root-level aggregate snapshot (single-account mode)
        total++;
      }
    } catch {
      /* skip entries we can't stat */
    }
  }
  return total;
}
