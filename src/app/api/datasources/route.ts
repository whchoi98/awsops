// External Datasource CRUD + Test + Query API
// 외부 데이터소스 CRUD + 연결 테스트 + 쿼리 API
// Supports: Prometheus, Loki, Tempo, ClickHouse
import { NextRequest, NextResponse } from 'next/server';
import { getConfig, saveConfig, getDatasources, getDatasourceById, getDatasourceAllowedNetworks } from '@/lib/app-config';
import type { DatasourceConfig, DatasourceType } from '@/lib/app-config';
import { queryDatasource, testConnection } from '@/lib/datasource-client';
import { getUserFromRequest } from '@/lib/auth-utils';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DATASOURCE_QUERY_PROMPTS } from '@/lib/datasource-prompts';

const VALID_TYPES: DatasourceType[] = ['prometheus', 'loki', 'tempo', 'clickhouse', 'jaeger', 'dynatrace', 'datadog'];

// Bedrock client for AI query generation / AI 쿼리 생성용 Bedrock 클라이언트
const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });

// --- SSRF prevention helpers / SSRF 방지 헬퍼 ---

// Convert IPv4 string to 32-bit unsigned integer / IPv4 문자열을 32비트 정수로 변환
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Check if IP falls within a CIDR range / IP가 CIDR 범위에 속하는지 확인
function isIpInCidr(ip: string, cidr: string): boolean {
  const [cidrIp, prefixStr] = cidr.split('/');
  if (!prefixStr) return ip === cidrIp; // Single IP, exact match
  const prefix = parseInt(prefixStr, 10);
  if (prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(cidrIp) & mask);
}

// Match hostname against pattern (exact or *.suffix glob) / 호스트명 패턴 매칭
function matchesHostnamePattern(hostname: string, pattern: string): boolean {
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) return hostname.endsWith(p.slice(1)) || hostname === p.slice(2);
  return hostname === p;
}

// Check if hostname is a private/internal address / 사설/내부 주소 여부 확인
function isPrivateOrLocal(hostname: string): boolean {
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true;
  // Strip IPv6 brackets / IPv6 괄호 제거
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  // IPv6 private/link-local / IPv6 사설/링크로컬 주소
  if (/^fe80:/i.test(h)) return true;                   // Link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;      // Unique local (fc00::/7)
  // IPv4 private ranges / IPv4 사설 대역
  const ipMatch = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16
  }
  return false;
}

// Check if hostname/IP matches any entry in the allowlist / allowlist 매칭 확인
function matchesAllowlist(hostname: string, allowlist: string[]): boolean {
  for (const entry of allowlist) {
    // CIDR or IP match (only if hostname is an IP)
    if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(entry) && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      if (isIpInCidr(hostname, entry)) return true;
    } else {
      // Hostname pattern match
      if (matchesHostnamePattern(hostname, entry)) return true;
    }
  }
  return false;
}

// --- URL validation (SSRF prevention) / URL 검증 (SSRF 방지) ---
// Block metadata/loopback unconditionally, allow private IPs only if in allowlist
// 메타데이터/루프백은 무조건 차단, 사설 IP는 allowlist에 있을 때만 허용
function isAllowedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    // 1. ALWAYS block cloud metadata — no exceptions / 클라우드 메타데이터 무조건 차단
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' || hostname === '100.100.100.200') return false;
    // 2. ALWAYS block loopback / 루프백 무조건 차단
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return false;
    // 3. Protocol check / 프로토콜 확인
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // 4. If private/internal, check allowlist / 사설/내부 주소면 allowlist 확인
    if (isPrivateOrLocal(hostname)) {
      const allowlist = getDatasourceAllowedNetworks();
      return matchesAllowlist(hostname, allowlist);
    }
    return true;
  } catch {
    return false;
  }
}

// --- Credential masking / 자격증명 마스킹 ---
// Returns a shallow copy with sensitive fields replaced by '***'
// password, token 등 민감 필드를 '***'로 대체한 복사본 반환
function maskCredentials(ds: DatasourceConfig): DatasourceConfig {
  const masked = { ...ds };
  if (masked.auth) {
    masked.auth = { ...masked.auth };
    if (masked.auth.password) masked.auth.password = '***';
    if (masked.auth.token) masked.auth.token = '***';
    if (masked.auth.headerValue) masked.auth.headerValue = '***';
  }
  return masked;
}

// --- Admin check helper / 관리자 권한 확인 ---
// If adminEmails is not configured, all authenticated users are treated as admin (fresh install)
// adminEmails가 설정되지 않은 경우, 모든 인증된 사용자를 관리자로 취급 (초기 설치)
function isAdminUser(req: NextRequest): boolean {
  const user = getUserFromRequest(req);
  const config = getConfig();
  if (!config.adminEmails || config.adminEmails.length === 0) return true;
  return config.adminEmails.includes(user.email);
}

function checkAdmin(req: NextRequest): { isAdmin: boolean; error?: NextResponse } {
  if (!isAdminUser(req)) {
    return { isAdmin: false, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { isAdmin: true };
}

// ============================================================================
// GET — List / Get datasources / 데이터소스 목록 조회 / 단건 조회
// ============================================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';

  // Allowlist query (admin-only) / 허용 네트워크 목록 조회 (관리자 전용)
  if (action === 'allowlist') {
    const adminCheck = checkAdmin(request);
    if (adminCheck.error) return adminCheck.error;
    return NextResponse.json({ allowedNetworks: getDatasourceAllowedNetworks() });
  }

  // Single datasource by ID / ID로 단건 조회
  if (action === 'get') {
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }
    const ds = getDatasourceById(id);
    if (!ds) {
      return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
    }
    return NextResponse.json(maskCredentials(ds));
  }

  // List all datasources (masked) / 전체 목록 (마스킹)
  const datasources = getDatasources().map(maskCredentials);
  const isAdmin = isAdminUser(request);
  return NextResponse.json({ datasources, isAdmin });
}

// ============================================================================
// POST — Test connection / Query / Add new datasource
// POST — 연결 테스트 / 쿼리 실행 / 새 데이터소스 추가
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    // --- Test connection (admin-only) / 연결 테스트 (관리자 전용) ---
    if (action === 'test') {
      const adminCheck = checkAdmin(request);
      if (adminCheck.error) return adminCheck.error;

      const { datasource } = body as { datasource: DatasourceConfig };
      if (!datasource || !datasource.url || !datasource.type) {
        return NextResponse.json({ error: 'Missing datasource url or type for test' }, { status: 400 });
      }
      // SSRF prevention: validate URL before making server-side request
      if (!isAllowedUrl(datasource.url)) {
        return NextResponse.json({ ok: false, latency: 0, error: 'URL not allowed: private/internal addresses are blocked' }, { status: 400 });
      }
      try {
        const result = await testConnection(datasource);
        return NextResponse.json(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection test failed';
        return NextResponse.json({ ok: false, latency: 0, error: message });
      }
    }

    // --- Update allowlist (admin-only) / 허용 네트워크 목록 업데이트 (관리자 전용) ---
    if (action === 'update-allowlist') {
      const adminCheck = checkAdmin(request);
      if (adminCheck.error) return adminCheck.error;
      const { networks } = body as { networks?: string[] };
      if (!Array.isArray(networks)) {
        return NextResponse.json({ error: 'networks must be an array' }, { status: 400 });
      }
      // Validate each entry and reject metadata IPs / 각 항목 검증, 메타데이터 IP 거부
      const BLOCKED_METADATA = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200'];
      for (const entry of networks) {
        if (typeof entry !== 'string' || entry.trim().length === 0) {
          return NextResponse.json({ error: `Invalid entry: empty value` }, { status: 400 });
        }
        const trimmed = entry.trim().toLowerCase();
        if (BLOCKED_METADATA.includes(trimmed) || BLOCKED_METADATA.includes(trimmed.split('/')[0])) {
          return NextResponse.json({ error: `Cannot allowlist metadata endpoint: ${entry}` }, { status: 400 });
        }
        if (trimmed === 'localhost' || trimmed === '127.0.0.1' || trimmed === '::1') {
          return NextResponse.json({ error: `Cannot allowlist loopback address: ${entry}` }, { status: 400 });
        }
        // Must be valid CIDR, IP, or hostname pattern
        const isIpOrCidr = /^\d+\.\d+\.\d+\.\d+(\/\d{1,2})?$/.test(trimmed);
        const isHostnamePattern = /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(trimmed);
        if (!isIpOrCidr && !isHostnamePattern) {
          return NextResponse.json({ error: `Invalid format: ${entry}. Use CIDR (10.0.0.0/24), IP (10.0.1.1), or hostname (*.example.com)` }, { status: 400 });
        }
      }
      const cleaned = networks.map(n => n.trim());
      saveConfig({ datasourceAllowedNetworks: cleaned });
      return NextResponse.json({ allowedNetworks: cleaned });
    }

    // --- Execute query (admin-only) / 쿼리 실행 (관리자 전용) ---
    if (action === 'query') {
      const adminCheck = checkAdmin(request);
      if (adminCheck.error) return adminCheck.error;

      const { datasourceId, query, options } = body as {
        datasourceId: string;
        query: string;
        options?: Record<string, unknown>;
      };
      if (!datasourceId || !query) {
        return NextResponse.json({ error: 'Missing datasourceId or query' }, { status: 400 });
      }
      const ds = getDatasourceById(datasourceId);
      if (!ds) {
        return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
      }
      // SSRF prevention: validate stored URL before querying
      // SSRF 방지: 쿼리 실행 전 저장된 URL 검증
      if (!isAllowedUrl(ds.url)) {
        return NextResponse.json({ error: 'Datasource URL not allowed (SSRF protection)' }, { status: 403 });
      }
      try {
        const result = await queryDatasource(ds, query, options);
        return NextResponse.json(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Query execution failed';
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // --- AI query generation (admin-only) / AI 쿼리 생성 (관리자 전용) ---
    if (action === 'generate-query') {
      const adminCheck = checkAdmin(request);
      if (adminCheck.error) return adminCheck.error;
      const { datasourceType, naturalLanguage, timeRange: tr } = body as {
        datasourceType?: string;
        naturalLanguage?: string;
        timeRange?: string;
      };
      if (!datasourceType || !naturalLanguage) {
        return NextResponse.json({ error: 'Missing datasourceType or naturalLanguage' }, { status: 400 });
      }
      if (!VALID_TYPES.includes(datasourceType as DatasourceType)) {
        return NextResponse.json({ error: `Invalid datasourceType: ${datasourceType}` }, { status: 400 });
      }
      const dsType = datasourceType as DatasourceType;
      const systemPrompt = DATASOURCE_QUERY_PROMPTS[dsType]
        + (tr ? `\n\nTime context: the user is looking at data from the last ${tr}.` : '');
      try {
        const bedrockBody = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: 'user', content: naturalLanguage }],
        });
        const response = await bedrockClient.send(new InvokeModelCommand({
          modelId: 'global.anthropic.claude-sonnet-4-6',
          contentType: 'application/json',
          accept: 'application/json',
          body: new TextEncoder().encode(bedrockBody),
        }));
        const result = JSON.parse(new TextDecoder().decode(response.body));
        let query = (result.content?.[0]?.text || '').trim();
        query = query.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const QUERY_LANGUAGES: Record<string, string> = {
          prometheus: 'PromQL', loki: 'LogQL', tempo: 'TraceQL',
          clickhouse: 'SQL', jaeger: 'Jaeger', dynatrace: 'DQL', datadog: 'Datadog',
        };
        return NextResponse.json({
          query,
          explanation: `Generated ${QUERY_LANGUAGES[dsType] || dsType} query from: "${naturalLanguage}"`,
          queryLanguage: QUERY_LANGUAGES[dsType] || dsType,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'AI query generation failed';
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // --- Add new datasource (admin-only) / 새 데이터소스 추가 (관리자 전용) ---
    const adminCheck = checkAdmin(request);
    if (adminCheck.error) return adminCheck.error;

    // UI sends { action: 'create', datasource: {...} } — unwrap if wrapped
    const dsPayload = body.datasource || body;
    const { name, type, url, isDefault, auth, settings } = dsPayload as Partial<DatasourceConfig>;

    // Validate required fields / 필수 필드 검증
    if (!name || !type || !url) {
      return NextResponse.json({ error: 'Missing required fields: name, type, url' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // SSRF prevention: validate URL before persisting / SSRF 방지: 저장 전 URL 검증
    if (!isAllowedUrl(url.trim())) {
      return NextResponse.json({ error: 'URL not allowed: private/internal addresses are blocked' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newDs: DatasourceConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      url: url.trim(),
      isDefault: isDefault || false,
      auth,
      settings,
      createdAt: now,
      updatedAt: now,
    };

    const existing = getDatasources();

    // If isDefault, unset other defaults of the same type / isDefault 시 같은 타입 기존 기본값 해제
    if (newDs.isDefault) {
      for (const ds of existing) {
        if (ds.type === type && ds.isDefault) {
          ds.isDefault = false;
        }
      }
    }

    const allDs = [...existing, newDs];
    saveConfig({ datasources: allDs });
    return NextResponse.json({ datasources: allDs.map(maskCredentials) }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// PUT — Update datasource (admin-only) / 데이터소스 수정 (관리자 전용)
// ============================================================================
export async function PUT(request: NextRequest) {
  try {
    const adminCheck = checkAdmin(request);
    if (adminCheck.error) return adminCheck.error;

    const body = await request.json();
    const { id, ...updates } = body as Partial<DatasourceConfig> & { id: string };

    if (!id) {
      return NextResponse.json({ error: 'Missing id field' }, { status: 400 });
    }

    // SSRF prevention: validate URL if provided / SSRF 방지: URL 변경 시 검증
    if (updates.url && !isAllowedUrl(updates.url.trim())) {
      return NextResponse.json({ error: 'URL not allowed: private/internal addresses are blocked' }, { status: 400 });
    }

    // Validate type if provided / type이 제공된 경우 검증
    if (updates.type && !VALID_TYPES.includes(updates.type)) {
      return NextResponse.json(
        { error: `Invalid type: ${updates.type}. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const datasources = getDatasources();
    const idx = datasources.findIndex(d => d.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
    }

    // Merge fields / 필드 병합
    const updated: DatasourceConfig = {
      ...datasources[idx],
      ...updates,
      id, // ID cannot change / ID 변경 불가
      createdAt: datasources[idx].createdAt, // createdAt is immutable / 생성일 불변
      updatedAt: new Date().toISOString(),
    };

    // If isDefault toggled on, unset other defaults of same type / isDefault 전환 시 같은 타입 기본값 해제
    if (updated.isDefault) {
      for (const ds of datasources) {
        if (ds.id !== id && ds.type === updated.type && ds.isDefault) {
          ds.isDefault = false;
        }
      }
    }

    datasources[idx] = updated;
    saveConfig({ datasources });
    return NextResponse.json({ datasources: datasources.map(maskCredentials) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// DELETE — Remove datasource (admin-only) / 데이터소스 삭제 (관리자 전용)
// ============================================================================
export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = checkAdmin(request);
    if (adminCheck.error) return adminCheck.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const datasources = getDatasources();
    const exists = datasources.some(d => d.id === id);
    if (!exists) {
      return NextResponse.json({ error: 'Datasource not found' }, { status: 404 });
    }

    const filtered = datasources.filter(d => d.id !== id);
    saveConfig({ datasources: filtered });
    return NextResponse.json({ datasources: filtered.map(maskCredentials) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
