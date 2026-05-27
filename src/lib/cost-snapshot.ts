import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { isMultiAccount, validateAccountId } from '@/lib/app-config';

const DATA_DIR = resolve(process.cwd(), 'data/cost');

function getCostDir(accountId?: string): string {
  if (accountId && accountId !== '__all__' && isMultiAccount() && validateAccountId(accountId)) {
    return resolve(process.cwd(), `data/cost/${accountId}`);
  }
  return resolve(process.cwd(), 'data/cost');
}

export interface CostSnapshot {
  date: string;
  timestamp: string;
  monthlyCost: Record<string, unknown>[];
  dailyCost: Record<string, unknown>[];
  serviceCost: Record<string, unknown>[];
}

function ensureDir(dir: string = DATA_DIR): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
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
): Promise<CostSnapshot | null> {
  // Extract cost-related results — accept both dashboard and cost page query keys
  const monthly = batchResults['monthlyCost'] || batchResults['costSummary'];
  const daily = batchResults['dailyCost'];
  const service = batchResults['serviceCost'] || batchResults['costDetail'];

  // At minimum need monthly data to save
  const monthlyRows = monthly?.rows || [];
  if (monthlyRows.length === 0 || monthly?.error) return null;

  const dir = getCostDir(accountId);
  ensureDir(dir);
  const today = dateStr();

  const snapshot: CostSnapshot = {
    date: today,
    timestamp: new Date().toISOString(),
    monthlyCost: monthlyRows as Record<string, unknown>[],
    dailyCost: (daily?.rows || []) as Record<string, unknown>[],
    serviceCost: (service?.rows || []) as Record<string, unknown>[],
  };

  writeFileSync(join(dir, `${today}.json`), JSON.stringify(snapshot, null, 2), 'utf-8');
  cleanOldSnapshots(180, dir);
  return snapshot;
}

/**
 * Get the latest cost snapshot (most recent date).
 */
export async function getLatestCostSnapshot(accountId?: string): Promise<CostSnapshot | null> {
  const dir = getCostDir(accountId);
  ensureDir(dir);

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (files.length === 0) return null;

  try {
    const raw = readFileSync(join(dir, files[files.length - 1]), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanOldSnapshots(maxDays: number, dir: string = DATA_DIR): void {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = dateStr(cutoff);
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (file.replace('.json', '') < cutoffStr) {
        unlinkSync(join(dir, file));
      }
    }
  } catch { /* ignore cleanup errors */ }
}
