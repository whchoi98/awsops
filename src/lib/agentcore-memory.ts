// AgentCore Memory — 대화 이력 및 분석 결과 영구 저장
// AgentCore Memory — persistent conversation history and analysis results
// AgentCore Memory API 사용, 미지원 시 로컬 파일 폴백
// Uses AgentCore Memory API, falls back to local file storage
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { getConfig } from '@/lib/app-config';

const DATA_DIR = resolve(process.cwd(), 'data/memory');
const REGION = 'ap-northeast-2';
const MAX_CONVERSATIONS = 100; // 최대 대화 수 / Max conversations stored

export interface ConversationRecord {
  id: string;
  timestamp: string;
  route: string;
  gateway: string;
  question: string;        // 사용자 질문 요약 / User question summary
  summary: string;         // 응답 요약 (첫 200자) / Response summary (first 200 chars)
  usedTools: string[];
  responseTimeMs: number;
  via: string;
  fullResponse?: string;   // 전체 응답 (로컬 저장 시) / Full response (local storage)
}

export interface MemoryStore {
  conversations: ConversationRecord[];
  lastUpdated: string;
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function getMemoryId(): string {
  return getConfig().memoryId || 'local-fallback';
}

// AgentCore Memory API로 저장 시도, 실패 시 로컬 / Try AgentCore API, fallback to local
export async function saveConversation(record: ConversationRecord): Promise<void> {
  const memoryId = getMemoryId();

  // 로컬 저장 (항상 수행) / Always save locally
  saveLocal(record);

  // AgentCore Memory API 시도 / Try AgentCore Memory API
  if (memoryId && memoryId !== 'local-fallback') {
    try {
      const content = JSON.stringify({
        question: record.question,
        summary: record.summary,
        route: record.route,
        gateway: record.gateway,
        usedTools: record.usedTools,
        timestamp: record.timestamp,
      });
      execFileSync('aws', [
        'bedrock-agentcore', 'create-memory-record',
        '--memory-id', memoryId,
        '--content', content,
        '--region', REGION,
        '--output', 'json',
      ], { encoding: 'utf-8', timeout: 10000 });
    } catch {
      // AgentCore Memory API 실패 — 로컬 저장은 이미 완료됨
    }
  }
}

// 대화 이력 조회 / Get conversation history
export async function getConversations(limit = 20): Promise<ConversationRecord[]> {
  return getLocalConversations(limit);
}

// 키워드 검색 / Search by keyword
export async function searchConversations(query: string, limit = 10): Promise<ConversationRecord[]> {
  const all = getLocalConversations(MAX_CONVERSATIONS);
  const q = query.toLowerCase();
  return all.filter(c =>
    c.question.toLowerCase().includes(q) ||
    c.summary.toLowerCase().includes(q) ||
    c.route.includes(q) ||
    c.usedTools.some(t => t.toLowerCase().includes(q))
  ).slice(0, limit);
}

// 요약 통계 / Summary stats
export function getMemoryStats(): {
  totalConversations: number;
  oldestDate: string | null;
  newestDate: string | null;
  topRoutes: Record<string, number>;
  topTools: Record<string, number>;
} {
  const all = getLocalConversations(MAX_CONVERSATIONS);
  const topRoutes: Record<string, number> = {};
  const topTools: Record<string, number> = {};

  all.forEach(c => {
    topRoutes[c.route] = (topRoutes[c.route] || 0) + 1;
    c.usedTools.forEach(t => { topTools[t] = (topTools[t] || 0) + 1; });
  });

  return {
    totalConversations: all.length,
    oldestDate: all.length > 0 ? all[all.length - 1].timestamp : null,
    newestDate: all.length > 0 ? all[0].timestamp : null,
    topRoutes,
    topTools,
  };
}

// --- 로컬 파일 저장 / Local file storage ---

function getStoreFile(): string {
  return join(DATA_DIR, 'conversations.json');
}

function loadStore(): MemoryStore {
  ensureDir();
  const file = getStoreFile();
  try {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf-8'));
    }
  } catch {}
  return { conversations: [], lastUpdated: new Date().toISOString() };
}

function saveStore(store: MemoryStore): void {
  ensureDir();
  writeFileSync(getStoreFile(), JSON.stringify(store, null, 2), 'utf-8');
}

function saveLocal(record: ConversationRecord): void {
  const store = loadStore();
  store.conversations.unshift(record);
  if (store.conversations.length > MAX_CONVERSATIONS) {
    store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS);
  }
  store.lastUpdated = new Date().toISOString();
  saveStore(store);
}

function getLocalConversations(limit: number): ConversationRecord[] {
  const store = loadStore();
  return store.conversations.slice(0, limit);
}
