import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const BASE_DIR = resolve(process.cwd(), 'data/cost');

function getDataDir(accountId?: string): string {
  if (!accountId || accountId === '__all__') return BASE_DIR;
  return join(BASE_DIR, accountId);
}

export interface CostSnapshot {
  date: string;
  timestamp: string;
  monthlyCost: Record<string, unknown>[];
  dailyCost: Record<string, unknown>[];
  serviceCost: Record<string, unknown>[];
}

function ensureDir(dir?: string): void {
  const d = dir || BASE_DIR;
  if (!existsSync(d)) {
    mkdirSync(d, { recursive: true });
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
  batchResults: Record<string, { rows: unknown[]; error?: string }>,
  accountId?: string
): Promise<void> {
  // Extract cost-related results — accept both dashboard and cost page query keys
  const monthly = batchResults['monthlyCost'] || batchResults['costSummary'];
  const daily = batchResults['dailyCost'];
  const service = batchResults['serviceCost'] || batchResults['costDetail'];

  // At minimum need monthly data to save
  const monthlyRows = monthly?.rows || [];
  if (monthlyRows.length === 0 || monthly?.error) return;

  const dataDir = getDataDir(accountId);
  ensureDir(dataDir);
  const today = dateStr();

  const snapshot: CostSnapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    monthlyCost: monthlyRows as Record<string, unknown>[],
    dailyCost: (daily?.rows || []) as Record<string, unknown>[],
    serviceCost: (service?.rows || []) as Record<string, unknown>[],
  };

  writeFileSync(join(dataDir, `${today}.json`), JSON.stringify(snapshot, null, 2), 'utf-8');
  cleanOldSnapshots(180, dataDir);
}

/**
 * Get the latest cost snapshot (most recent date).
 */
export async function getLatestCostSnapshot(accountId?: string): Promise<CostSnapshot | null> {
  const dataDir = getDataDir(accountId);
  ensureDir(dataDir);

  const files = readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) return null;

  try {
    const raw = readFileSync(join(dataDir, files[files.length - 1]), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanOldSnapshots(maxDays: number, dataDir: string = BASE_DIR): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = dateStr(cutoff);
    const files = readdirSync(dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (file.replace('.json', '') < cutoffStr) {
        unlinkSync(join(dataDir, file));
      }
    }
  } catch { /* ignore cleanup errors */ }
}
