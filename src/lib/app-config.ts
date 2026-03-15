import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const CONFIG_PATH = resolve(process.cwd(), 'data/config.json');

export interface AppConfig {
  costEnabled: boolean;
  agentRuntimeArn?: string;
  codeInterpreterName?: string;
}

const DEFAULT_CONFIG: AppConfig = { costEnabled: true };

export function getConfig(): AppConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) };
    }
  } catch { /* return default */ }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Partial<AppConfig>): void {
  const current = getConfig();
  const merged = { ...current, ...config };
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}
