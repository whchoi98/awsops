// AgentCore Memory — 대화 이력 영구 저장 (인메모리 캐시 + 디바운스 flush)
// Persistent conversation history with in-memory cache + debounced flush
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const DATA_DIR = resolve(process.cwd(), 'data/memory');
const SESSIONS_DIR = resolve(DATA_DIR, 'sessions');
const MAX_CONVERSATIONS = 100;
const MAX_SESSIONS = 50;
const MAX_SESSION_MESSAGES = 200;

export interface ConversationRecord {
  id: string;
  userId: string;
  timestamp: string;
  route: string;
  gateway: string;
  question: string;
  summary: string;
  usedTools: string[];
  responseTimeMs: number;
  via: string;
}

interface MemoryStore {
  conversations: ConversationRecord[];
  lastUpdated: string;
}

// 인메모리 캐시 / In-memory cache
let _store: MemoryStore | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY = 5000;

function getStoreFile(): string { return join(DATA_DIR, 'conversations.json'); }

function loadFromDisk(): MemoryStore {
  try {
    const raw = readFileSync(getStoreFile(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { conversations: [], lastUpdated: new Date().toISOString() };
  }
}

function flushToDisk(): void {
  if (!_store) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(getStoreFile(), JSON.stringify(_store, null, 2), 'utf-8');
  } catch {}
}

function scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushToDisk, FLUSH_DELAY);
}

function getStore(): MemoryStore {
  if (!_store) _store = loadFromDisk();
  return _store;
}

// 대화 저장 (fire-and-forget) / Save conversation
export async function saveConversation(record: ConversationRecord): Promise<void> {
  const store = getStore();
  store.conversations.unshift(record);
  if (store.conversations.length > MAX_CONVERSATIONS) {
    store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS);
  }
  store.lastUpdated = new Date().toISOString();
  scheduleFlush();
}

// 대화 이력 조회 (사용자별) / Get conversations (per user)
export async function getConversations(limit = 20, userId?: string): Promise<ConversationRecord[]> {
  const all = getStore().conversations;
  const filtered = userId ? all.filter(c => c.userId === userId) : all;
  return filtered.slice(0, limit);
}

// 키워드 검색 (사용자별) / Search by keyword (per user)
export async function searchConversations(query: string, limit = 10, userId?: string): Promise<ConversationRecord[]> {
  const all = getStore().conversations;
  const q = query.toLowerCase();
  return all.filter(c =>
    (!userId || c.userId === userId) &&
    (c.question.toLowerCase().includes(q) ||
    c.summary.toLowerCase().includes(q) ||
    c.route.includes(q) ||
    c.usedTools.some(t => t.toLowerCase().includes(q)))
  ).slice(0, limit);
}

// ============================================================================
// Chat Sessions — 전체 대화 이력 저장 / Full conversation history storage
// ============================================================================

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  route?: string;
  via?: string;
  usedTools?: string[];
  model?: string;
  responseTimeMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: SessionMessage[];
}

export interface SessionSummary {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messageCount: number;
  lastRoute?: string;
}

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

// 세션 저장 / Save session (append messages)
export async function saveSession(sessionId: string, userId: string, userMessage: SessionMessage, assistantMessage: SessionMessage): Promise<void> {
  ensureSessionsDir();
  const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
  let session: ChatSession;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    session = JSON.parse(raw);
  } catch {
    session = {
      id: sessionId,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: userMessage.content.slice(0, 100),
      messages: [],
    };
  }

  session.messages.push(userMessage, assistantMessage);
  if (session.messages.length > MAX_SESSION_MESSAGES) {
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
  }
  session.updatedAt = new Date().toISOString();

  try {
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  } catch {}
}

// 세션 조회 / Get full session
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const filePath = join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 세션 목록 (사용자별, 메타데이터만) / List sessions (per user, metadata only)
export async function listSessions(userId?: string, limit = 30): Promise<SessionSummary[]> {
  ensureSessionsDir();
  try {
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      if (summaries.length >= limit) break;
      try {
        const raw = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
        const session: ChatSession = JSON.parse(raw);
        if (userId && session.userId !== userId) continue;
        const lastAssistant = [...session.messages].reverse().find(m => m.role === 'assistant');
        summaries.push({
          id: session.id,
          userId: session.userId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          title: session.title,
          messageCount: session.messages.length,
          lastRoute: lastAssistant?.route,
        });
      } catch {}
    }

    return summaries;
  } catch {
    return [];
  }
}

// 오래된 세션 정리 / Cleanup old sessions
export function cleanupOldSessions(): void {
  ensureSessionsDir();
  try {
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length > MAX_SESSIONS) {
      for (const file of files.slice(MAX_SESSIONS)) {
        try { unlinkSync(join(SESSIONS_DIR, file)); } catch {}
      }
    }
  } catch {}
}

// 요약 통계 / Summary stats
export function getMemoryStats(): {
  totalConversations: number;
  oldestDate: string | null;
  newestDate: string | null;
  topRoutes: Record<string, number>;
  topTools: Record<string, number>;
} {
  const all = getStore().conversations;
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
    topRoutes, topTools,
  };
}
