// AWSops Comprehensive Diagnosis Report API — Async background generation + S3 storage
// AWSops 종합진단 리포트 API — 비동기 백그라운드 생성 + S3 저장
import { NextRequest, NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { collectReportData, formatReportForBedrock } from '@/lib/report-generator';
import type { ReportData } from '@/lib/report-generator';
import { REPORT_SECTIONS } from '@/lib/report-prompts';
import { generateReportPptx } from '@/lib/report-pptx';
import { validateAccountId, getAccountById } from '@/lib/app-config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ============================================================================
// Clients + Constants
// ============================================================================

const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
const s3Client = new S3Client({ region: 'ap-northeast-2' });
const MODEL_ID = 'global.anthropic.claude-opus-4-6-v1';
const REPORT_BUCKET = 'awsops-deploy-180294183052';
const REPORT_S3_PREFIX = 'reports/';
const REPORTS_META_DIR = path.join(process.cwd(), 'data', 'reports');

// ============================================================================
// Types
// ============================================================================

interface SectionResult {
  section: string;
  title: string;
  content: string;
}

interface ReportProgress {
  current: number;
  total: number;
  currentSection: string;
  statusMessage?: string;
  completedSections?: string[];
}

interface ReportMeta {
  reportId: string;
  status: 'generating' | 'completed' | 'failed';
  progress: ReportProgress;
  accountId?: string;
  accountAlias?: string;
  createdAt: string;
  completedAt: string | null;
  s3Key: string | null;
  downloadUrl: string | null;
  sections: SectionResult[];
  error: string | null;
}

// ============================================================================
// Section batches — 15 sections in 5 batches of 3
// 15개 섹션을 5 배치(3개씩)로 분석
// ============================================================================

const SECTION_BATCHES: string[][] = [
  ['cost-overview', 'cost-compute', 'cost-network'],
  ['cost-storage', 'idle-resources', 'security-posture'],
  ['network-architecture', 'compute-analysis', 'eks-analysis'],
  ['database-analysis', 'msk-analysis', 'storage-analysis'],
  ['executive-summary', 'recommendations', 'appendix'],
];

// Desired final order: executive-summary first, appendix last
// 최종 순서: executive-summary 먼저, appendix 마지막
const SECTION_ORDER: string[] = [
  'executive-summary',
  'cost-overview', 'cost-compute', 'cost-network', 'cost-storage',
  'idle-resources', 'security-posture',
  'network-architecture', 'compute-analysis', 'eks-analysis',
  'database-analysis', 'msk-analysis', 'storage-analysis',
  'recommendations', 'appendix',
];

// ============================================================================
// Meta file helpers
// ============================================================================

function readReportMeta(reportId: string): ReportMeta | null {
  try {
    const filePath = path.join(REPORTS_META_DIR, `${reportId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function updateReportMeta(reportId: string, updates: Partial<ReportMeta>): void {
  try {
    const filePath = path.join(REPORTS_META_DIR, `${reportId}.json`);
    const current = readReportMeta(reportId);
    if (!current) return;
    const merged = { ...current, ...updates };
    // Merge progress field shallowly if both exist
    if (updates.progress && current.progress) {
      merged.progress = { ...current.progress, ...updates.progress };
    }
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.error(`[Report] Failed to update meta for ${reportId}:`, err);
  }
}

// Mark stale "generating" reports as failed — called on startup/POST
// 서버 재시작 후 generating 상태로 남은 리포트를 failed로 마킹
function markStaleReportsAsFailed(): void {
  try {
    if (!fs.existsSync(REPORTS_META_DIR)) return;
    const files = fs.readdirSync(REPORTS_META_DIR).filter(f => f.endsWith('.json'));
    const now = Date.now();
    for (const file of files) {
      try {
        const meta: ReportMeta = JSON.parse(fs.readFileSync(path.join(REPORTS_META_DIR, file), 'utf-8'));
        if (meta.status === 'generating') {
          const created = new Date(meta.createdAt).getTime();
          // If generating for more than 15 minutes, it's stale (worker died)
          if (now - created > 15 * 60 * 1000) {
            updateReportMeta(meta.reportId, {
              status: 'failed',
              error: 'Report generation was interrupted (server restart). Please start a new diagnosis.',
            });
          }
        }
      } catch { /* skip malformed files */ }
    }
  } catch { /* ignore */ }
}

// Run on module load (server startup)
markStaleReportsAsFailed();

function reorderSections(sections: SectionResult[]): SectionResult[] {
  const byKey = new Map<string, SectionResult>();
  for (const s of sections) byKey.set(s.section, s);
  const ordered: SectionResult[] = [];
  for (const key of SECTION_ORDER) {
    const s = byKey.get(key);
    if (s) ordered.push(s);
  }
  // Append any sections not in SECTION_ORDER (safety net)
  for (const s of sections) {
    if (!ordered.includes(s)) ordered.push(s);
  }
  return ordered;
}

// ============================================================================
// Bedrock section analysis
// 섹션별 Bedrock 분석
// ============================================================================

async function analyzeSection(
  section: string,
  data: ReportData,
  isEn: boolean,
  previousResults: SectionResult[],
): Promise<SectionResult> {
  const prompt = REPORT_SECTIONS.find(s => s.section === section);
  const title = prompt
    ? (isEn ? prompt.title : prompt.titleKo)
    : section;

  // Appendix: format inventory data directly without Bedrock call
  // 부록: Bedrock 호출 없이 인벤토리 데이터를 직접 포맷
  if (section === 'appendix') {
    const context = await formatReportForBedrock(data, 'appendix');
    return { section, title, content: context || (isEn ? 'No inventory data.' : '인벤토리 데이터가 없습니다.') };
  }

  // Build context from formatReportForBedrock
  let context = await formatReportForBedrock(data, section);

  // For executive-summary and recommendations, include previous section results as extra context
  // executive-summary와 recommendations는 이전 섹션 결과를 추가 컨텍스트로 포함
  if ((section === 'executive-summary' || section === 'recommendations') && previousResults.length > 0) {
    const prevContext = previousResults
      .map(r => `### ${r.title}\n${r.content.slice(0, 2000)}`)
      .join('\n\n---\n\n');
    context = `${context}\n\n# Previous Section Analyses\n${prevContext}`;
  }

  // If no meaningful data, return placeholder
  if (!context || context.includes('No data') || context.trim() === '') {
    return {
      section,
      title,
      content: isEn ? 'No data available for this section.' : '이 섹션에 대한 데이터가 없습니다.',
    };
  }

  // System prompt: use section-specific prompt or a generic one
  const systemPrompt = prompt?.systemPrompt || (isEn
    ? 'You are a senior AWS cloud architect. Analyze the provided data and produce a structured markdown report section.'
    : '당신은 시니어 AWS 클라우드 아키텍트입니다. 제공된 데이터를 분석하여 구조화된 마크다운 리포트 섹션을 작성하세요.');

  const langHint = isEn ? 'Respond in English.' : '한국어로 응답하세요.';

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `${langHint}\n\nAnalyze this data:\n\n${context}`,
      },
    ],
  });

  const resp = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    }),
  );

  const decoded = JSON.parse(new TextDecoder().decode(resp.body));
  const text: string = decoded.content?.[0]?.text || '';
  return { section, title, content: text };
}

// ============================================================================
// Background report generation worker
// 백그라운드 리포트 생성 워커
// ============================================================================

// Section sub-topic descriptions for live progress
// 섹션별 세부 분석 항목 (실시간 진행 표시용)
const SECTION_SUBTOPICS: Record<string, string[]> = {
  'cost-overview': ['서비스별 비용 집계', '월별 추이 분석', '비용 이상 감지'],
  'cost-compute': ['EC2 인스턴스 비용', 'Lambda 실행 비용', 'ECS/Fargate 비용', 'Savings Plans 커버리지'],
  'cost-network': ['Inter-AZ 데이터 전송', 'NAT Gateway 비용', 'Data Transfer Out', 'VPN/TGW 비용'],
  'cost-storage': ['S3 스토리지 클래스', 'EBS 볼륨 비용', 'Snapshot 비용', 'Lifecycle 정책'],
  'idle-resources': ['미연결 EBS 스캔', '미사용 EIP 스캔', '중지된 EC2 스캔', '오래된 스냅샷', '미사용 보안그룹'],
  'security-posture': ['Security Group 분석', 'S3 퍼블릭 접근', 'EBS 암호화', 'IAM 사용자 점검', 'CIS 컴플라이언스'],
  'network-architecture': ['VPC 구성 분석', '서브넷 설계', 'NAT Gateway 이중화', 'Route Table', 'TGW/Peering'],
  'compute-analysis': ['EC2 활용률 분석', 'Instance Type 적정성', 'Lambda 메모리 최적화', 'Auto Scaling 설정'],
  'eks-analysis': ['EKS 클러스터 구성', '노드풀 분석', 'Pod 리소스 효율', 'Namespace 비용'],
  'database-analysis': ['RDS 인스턴스 분석', 'ElastiCache 노드', 'OpenSearch 도메인', 'Multi-AZ 설정', '스토리지 효율'],
  'msk-analysis': ['MSK 브로커 구성', '처리량 분석', 'EBS 사용량', 'Consumer Lag'],
  'storage-analysis': ['S3 버킷 구조', 'EBS 타입 분포', '암호화 현황', 'Lifecycle 적용률'],
  'executive-summary': ['전체 섹션 종합', '6 Pillar 점수 산출', '핵심 발견사항 도출'],
  'recommendations': ['Quick Wins 도출', '단기 로드맵', '중기 로드맵', 'ROI 산출'],
  'appendix': ['리소스 인벤토리 집계'],
};

async function generateReportBackground(
  reportId: string,
  accountId?: string,
  accountAlias?: string,
  isEn?: boolean,
): Promise<void> {
  const completedSections: string[] = [];

  // Live progress send — writes to meta file instead of SSE
  const liveSend = (_event: string, data: any) => {
    if (data?.message) {
      const meta = readReportMeta(reportId);
      if (meta) {
        updateReportMeta(reportId, {
          progress: { ...meta.progress, statusMessage: data.message, completedSections },
        });
      }
    }
  };

  // Phase 1: Collect data
  // 1단계: 데이터 수집
  console.log(`[Report] ${reportId} — Phase 1: Collecting data...`);
  updateReportMeta(reportId, {
    progress: { current: 0, total: 15, currentSection: 'data-collection', statusMessage: isEn ? 'Collecting infrastructure data...' : '인프라 데이터 수집 중...', completedSections },
  });
  let reportData: ReportData;
  try {
    reportData = await collectReportData(accountId, liveSend, isEn);
    console.log(`[Report] ${reportId} — Phase 1 done. Starting Bedrock analysis...`);
  } catch (err) {
    console.error(`[Report] ${reportId} — Data collection failed:`, err);
    throw err;
  }

  // Phase 2: Analyze 15 sections in 5 batches of 3
  // 2단계: 15개 섹션을 5 배치로 분석
  const sectionResults: SectionResult[] = [];
  let completed = 0;

  for (const batch of SECTION_BATCHES) {
    // Update status with sub-topics for each section in the batch
    const batchTopics = batch.flatMap(s => (SECTION_SUBTOPICS[s] || [s]).slice(0, 2)).join(', ');
    console.log(`[Report] ${reportId} — Batch: ${batch.join(', ')}`);
    updateReportMeta(reportId, {
      progress: { current: completed, total: 15, currentSection: batch[0], statusMessage: batchTopics, completedSections },
    });

    const results = await Promise.allSettled(
      batch.map(section => analyzeSection(section, reportData, !!isEn, sectionResults)),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        sectionResults.push(r.value);
      } else {
        sectionResults.push({
          section: batch[i],
          title: batch[i],
          content: isEn
            ? `Analysis failed: ${r.reason?.message || 'Unknown error'}`
            : `분석 실패: ${r.reason?.message || '알 수 없는 오류'}`,
        });
      }
      completed++;
      completedSections.push(batch[i]);
    }

    updateReportMeta(reportId, {
      progress: { current: completed, total: 15, currentSection: batch[batch.length - 1], statusMessage: '', completedSections },
    });
  }

  // Reorder: executive-summary first, appendix last
  const ordered = reorderSections(sectionResults);

  // Phase 3: Generate PPTX
  // 3단계: PPTX 생성
  updateReportMeta(reportId, {
    progress: { current: 15, total: 15, currentSection: 'generating-pptx' },
  });

  const pptxBuffer = await generateReportPptx({
    title: isEn ? 'AWSops Comprehensive Diagnosis Report' : 'AWSops 종합진단 리포트',
    subtitle: new Date().toLocaleDateString(isEn ? 'en-US' : 'ko-KR', {
      year: 'numeric',
      month: 'long',
    }),
    accountAlias,
    generatedAt: new Date().toISOString(),
    sections: ordered.map(r => ({ title: r.title, content: r.content })),
  });

  // Phase 4: Save locally (permanent) + Upload to S3
  // 4단계: 로컬 영구 저장 + S3 업로드
  const localPptxPath = path.join(REPORTS_META_DIR, `${reportId}.pptx`);
  fs.writeFileSync(localPptxPath, pptxBuffer);

  const s3Key = `${REPORT_S3_PREFIX}${reportId}.pptx`;
  await s3Client.send(new PutObjectCommand({
    Bucket: REPORT_BUCKET,
    Key: s3Key,
    Body: pptxBuffer,
    ContentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }));

  // Generate presigned URL (valid for 7 days)
  // 7일간 유효한 사전 서명 URL 생성
  const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: REPORT_BUCKET,
    Key: s3Key,
  }), { expiresIn: 7 * 24 * 60 * 60 });

  updateReportMeta(reportId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    s3Key,
    downloadUrl,
    sections: ordered,
  });
}

// ============================================================================
// POST handler — Start background report generation
// POST 핸들러 — 백그라운드 리포트 생성 시작
// ============================================================================

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { accountId: rawAccountId, lang } = body;
  const accountId = rawAccountId && validateAccountId(rawAccountId) ? rawAccountId : undefined;
  const account = accountId ? getAccountById(accountId) : undefined;
  const isEn = lang === 'en';

  const reportId = randomUUID();

  // Create initial status file
  // 초기 상태 파일 생성
  const meta: ReportMeta = {
    reportId,
    status: 'generating',
    progress: { current: 0, total: 15, currentSection: '' },
    accountId,
    accountAlias: account?.alias,
    createdAt: new Date().toISOString(),
    completedAt: null,
    s3Key: null,
    downloadUrl: null,
    sections: [],
    error: null,
  };

  fs.mkdirSync(REPORTS_META_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS_META_DIR, `${reportId}.json`),
    JSON.stringify(meta, null, 2),
  );

  // Start background generation (fire and forget)
  // 백그라운드 생성 시작 (실행 후 대기 없음)
  generateReportBackground(reportId, accountId, account?.alias, isEn).catch(err => {
    console.error(`[Report] Background generation failed for ${reportId}:`, err);
    updateReportMeta(reportId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ reportId, status: 'generating' });
}

// ============================================================================
// GET handler — Status, Download, List
// GET 핸들러 — 상태 조회, 다운로드, 목록
// ============================================================================

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action') || 'status';
  const id = request.nextUrl.searchParams.get('id');

  // ── List recent reports ──
  if (action === 'list') {
    try {
      if (!fs.existsSync(REPORTS_META_DIR)) {
        return NextResponse.json({ reports: [] });
      }
      const files = fs.readdirSync(REPORTS_META_DIR).filter(f => f.endsWith('.json'));
      const reports: Array<{
        reportId: string;
        status: string;
        accountAlias?: string;
        createdAt: string;
        completedAt: string | null;
      }> = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(REPORTS_META_DIR, file), 'utf-8');
          const meta: ReportMeta = JSON.parse(raw);
          reports.push({
            reportId: meta.reportId,
            status: meta.status,
            accountAlias: meta.accountAlias,
            createdAt: meta.createdAt,
            completedAt: meta.completedAt,
          });
        } catch {
          // Skip corrupted files
        }
      }

      // Sort by createdAt descending
      reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return NextResponse.json({ reports });
    } catch {
      return NextResponse.json({ reports: [] });
    }
  }

  // Validate ID for status and download actions
  if (!id || !/^[a-f0-9-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid or missing report ID' }, { status: 400 });
  }

  // ── Status check ──
  if (action === 'status') {
    const meta = readReportMeta(id);
    if (!meta) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // If completed and downloadUrl might be expired, regenerate presigned URL
    // 완료 상태에서 downloadUrl이 만료되었을 수 있으면 사전 서명 URL 재생성
    let downloadUrl = meta.downloadUrl;
    if (meta.status === 'completed' && meta.s3Key) {
      try {
        downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
          Bucket: REPORT_BUCKET,
          Key: meta.s3Key,
        }), { expiresIn: 7 * 24 * 60 * 60 });
        // Update stored URL
        updateReportMeta(id, { downloadUrl });
      } catch {
        // Keep existing URL if regeneration fails
      }
    }

    return NextResponse.json({
      reportId: meta.reportId,
      status: meta.status,
      progress: meta.progress,
      downloadUrl: meta.status === 'completed' ? downloadUrl : undefined,
      sections: meta.status === 'completed'
        ? meta.sections.map(s => ({ section: s.section, title: s.title }))
        : undefined,
      error: meta.error,
      createdAt: meta.createdAt,
      completedAt: meta.completedAt,
    });
  }

  // ── Download (redirect to fresh presigned URL) ──
  if (action === 'download') {
    const meta = readReportMeta(id);
    if (!meta) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    if (meta.status !== 'completed' || !meta.s3Key) {
      return NextResponse.json(
        { error: 'Report not yet completed' },
        { status: meta.status === 'failed' ? 410 : 202 },
      );
    }

    try {
      // Generate fresh presigned URL (valid for 1 hour for immediate download)
      // 즉시 다운로드용 1시간 유효 사전 서명 URL 생성
      const freshUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: REPORT_BUCKET,
        Key: meta.s3Key,
      }), { expiresIn: 60 * 60 });

      return NextResponse.redirect(freshUrl, 302);
    } catch {
      // S3 presigned URL failed — fallback to local file
      const localPath = path.join(REPORTS_META_DIR, `${id}.pptx`);
      if (fs.existsSync(localPath)) {
        const buffer = fs.readFileSync(localPath);
        const date = new Date().toISOString().split('T')[0];
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'Content-Disposition': `attachment; filename="AWSops_Report_${date}.pptx"`,
            'Content-Length': String(buffer.length),
          },
        });
      }
      return NextResponse.json({ error: 'Report file not available' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
