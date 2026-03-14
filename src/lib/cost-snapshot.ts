import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const DATA_DIR = resolve(process.cwd(), 'data/cost');

export interface CostSnapshot {
  date: string;
  timestamp: string;
  monthlyCost: Record<string, unknown>[];
  dailyCost: Record<string, unknown>[];
  serviceCost: Record<string, unknown>[];
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function dateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Save cost data snapshot from batch query results.
 * Called when cost queries succeed (dashboard or cost page).
 */
export async function saveCostSnapshot(
  batchResults: Record<string, { rows: unknown[]; error?: string }>
): Promise<void> {
  // Extract cost-related results — accept both dashboard and cost page query keys
  const monthly = batchResults['monthlyCost'] || batchResults['costSummary'];
  const daily = batchResults['dailyCost'];
  const service = batchResults['serviceCost'] || batchResults['costDetail'];

  // At minimum need monthly data to save
  const monthlyRows = monthly?.rows || [];
  if (monthlyRows.length === 0 || monthly?.error) return;

  ensureDir();
  const today = dateStr();

  const snapshot: CostSnapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    monthlyCost: monthlyRows as Record<string, unknown>[],
    dailyCost: (daily?.rows || []) as Record<string, unknown>[],
    serviceCost: (service?.rows || []) as Record<string, unknown>[],
  };

  writeFileSync(join(DATA_DIR, `${today}.json`), JSON.stringify(snapshot, null, 2), 'utf-8');
  cleanOldSnapshots(180);
}

/**
 * Get the latest cost snapshot (most recent date).
 */
export async function getLatestCostSnapshot(): Promise<CostSnapshot | null> {
  ensureDir();

  const files = readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) return null;

  try {
    const raw = readFileSync(join(DATA_DIR, files[files.length - 1]), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanOldSnapshots(maxDays: number): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = dateStr(cutoff);
    const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (file.replace('.json', '') < cutoffStr) {
        unlinkSync(join(DATA_DIR, file));
      }
    }
  } catch { /* ignore cleanup errors */ }
}
