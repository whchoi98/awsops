// Bedrock Model Usage Metrics API — CloudWatch metrics per model + AWSops app stats
// Bedrock 모델 사용량 메트릭 API — 모델별 CloudWatch 메트릭 + AWSops 앱 통계
import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { getStats } from '@/lib/agentcore-stats';

const REGION = 'ap-northeast-2';

function awsCli(args: string[], timeout = 20000): any {
  try {
    const output = execFileSync('aws', [...args, '--region', REGION, '--output', 'json'],
      { encoding: 'utf-8', timeout });
    return JSON.parse(output);
  } catch { return null; }
}

// Bedrock pricing (USD per 1M tokens) / Bedrock 가격 (USD / 100만 토큰)
// Cross-region inference pricing for ap-northeast-2 / 서울 리전 교차 추론 가격
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number; label: string }> = {
  // Claude 4.x — cross-region inference IDs (as seen in CloudWatch) / 교차 추론 ID (CloudWatch 실제 값)
  'anthropic.claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75, label: 'Claude Sonnet 4.6' },
  'anthropic.claude-sonnet-4-6-v1': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75, label: 'Claude Sonnet 4.6' },
  'anthropic.claude-opus-4-6-v1': { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75, label: 'Claude Opus 4.6' },
  'anthropic.claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75, label: 'Claude Opus 4.6' },
  'anthropic.claude-sonnet-4-5-20250514-v1:0': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75, label: 'Claude Sonnet 4.5' },
  'anthropic.claude-opus-4-0-20250514-v1:0': { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75, label: 'Claude Opus 4' },
  // Claude 3.x
  'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75, label: 'Claude 3.5 Sonnet v2' },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': { input: 3, output: 15, label: 'Claude 3.5 Sonnet' },
  'anthropic.claude-3-5-haiku-20241022-v1:0': { input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1, label: 'Claude 3.5 Haiku' },
  'anthropic.claude-3-haiku-20240307-v1:0': { input: 0.25, output: 1.25, label: 'Claude 3 Haiku' },
  'anthropic.claude-3-sonnet-20240229-v1:0': { input: 3, output: 15, label: 'Claude 3 Sonnet' },
  'anthropic.claude-3-opus-20240229-v1:0': { input: 15, output: 75, label: 'Claude 3 Opus' },
  // Amazon models
  'amazon.nova-pro-v1:0': { input: 0.80, output: 3.20, label: 'Nova Pro' },
  'amazon.nova-lite-v1:0': { input: 0.06, output: 0.24, label: 'Nova Lite' },
  'amazon.nova-micro-v1:0': { input: 0.035, output: 0.14, label: 'Nova Micro' },
  'amazon.titan-text-express-v1': { input: 0.20, output: 0.60, label: 'Titan Text Express' },
};

// Get friendly model name / 모델 표시명 가져오기
function getModelLabel(modelId: string): string {
  // Try exact match / 정확한 매칭 시도
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId].label;
  // Try prefix match for cross-region IDs / 교차 리전 ID 접두사 매칭
  const base = modelId.replace(/^(us\.|eu\.|ap\.|global\.)/, '');
  if (MODEL_PRICING[base]) return MODEL_PRICING[base].label;
  // Extract readable name / 읽기 쉬운 이름 추출
  const parts = modelId.split('.');
  return parts.length > 1 ? parts.slice(1).join('.').replace(/-v\d.*$/, '') : modelId;
}

// Get pricing for model / 모델 가격 정보 가져오기
function getModelPricing(modelId: string): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  const base = modelId.replace(/^(us\.|eu\.|ap\.|global\.)/, '');
  const p = MODEL_PRICING[base] || MODEL_PRICING[modelId];
  if (p) return { input: p.input, output: p.output, cacheRead: p.cacheRead || 0, cacheWrite: p.cacheWrite || 0 };
  // Default fallback / 기본 폴백
  if (modelId.includes('haiku')) return { input: 0.25, output: 1.25, cacheRead: 0, cacheWrite: 0 };
  if (modelId.includes('opus')) return { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 };
  return { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 };
}

// Time range configs / 시간 범위 설정
const RANGE_CONFIGS: Record<string, { hours: number; period: number }> = {
  '1h': { hours: 1, period: 300 },
  '6h': { hours: 6, period: 300 },
  '24h': { hours: 24, period: 3600 },
  '7d': { hours: 168, period: 86400 },
  '30d': { hours: 720, period: 86400 },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const range = searchParams.get('range') || '24h';
  const rangeConfig = RANGE_CONFIGS[range] || RANGE_CONFIGS['24h'];

  // Step 1: Discover active models / 활성 모델 발견
  if (action === 'models' || action === 'summary') {
    try {
      // List metrics to find active models / 활성 모델 찾기 위해 메트릭 목록 조회
      const listResult = awsCli([
        'cloudwatch', 'list-metrics',
        '--namespace', 'AWS/Bedrock',
        '--metric-name', 'Invocations',
      ]);

      const modelIds = new Set<string>();
      for (const metric of (listResult?.Metrics || [])) {
        for (const dim of (metric.Dimensions || [])) {
          if (dim.Name === 'ModelId') modelIds.add(dim.Value);
        }
      }

      if (action === 'models') {
        return NextResponse.json({
          models: Array.from(modelIds).map(id => ({
            modelId: id,
            label: getModelLabel(id),
            pricing: getModelPricing(id),
          })),
        });
      }

      // action === 'summary': fetch metrics for all models / 모든 모델의 메트릭 조회
      const models = Array.from(modelIds);
      if (models.length === 0) {
        return NextResponse.json({ models: [], metrics: [], totalCost: 0 });
      }

      const now = new Date();
      const startTime = new Date(now.getTime() - rangeConfig.hours * 60 * 60 * 1000);

      // Build queries for all models / 모든 모델에 대한 쿼리 생성
      const queries: any[] = [];
      const metricNames = [
        { id: 'inv', name: 'Invocations', stat: 'Sum' },
        { id: 'in_tok', name: 'InputTokenCount', stat: 'Sum' },
        { id: 'out_tok', name: 'OutputTokenCount', stat: 'Sum' },
        { id: 'latency', name: 'InvocationLatency', stat: 'Average' },
        { id: 'err4xx', name: 'InvocationClientErrors', stat: 'Sum' },
        { id: 'err5xx', name: 'InvocationServerErrors', stat: 'Sum' },
        // Prompt caching metrics / 프롬프트 캐싱 메트릭
        { id: 'cache_read', name: 'CacheReadInputTokenCount', stat: 'Sum' },
        { id: 'cache_write', name: 'CacheWriteInputTokenCount', stat: 'Sum' },
      ];

      for (let mi = 0; mi < models.length; mi++) {
        const safeModel = `m${mi}`;
        for (const m of metricNames) {
          queries.push({
            Id: `${m.id}_${safeModel}`,
            MetricStat: {
              Metric: {
                Namespace: 'AWS/Bedrock',
                MetricName: m.name,
                Dimensions: [{ Name: 'ModelId', Value: models[mi] }],
              },
              Period: rangeConfig.period,
              Stat: m.stat,
            },
          });
        }
      }

      // CloudWatch allows max 500 queries / CloudWatch 최대 500 쿼리
      const metricInput = JSON.stringify({
        MetricDataQueries: queries.slice(0, 500),
        StartTime: startTime.toISOString(),
        EndTime: now.toISOString(),
      });

      const tmpFile = `/tmp/bedrock-metrics-${Date.now()}.json`;
      execFileSync('bash', ['-c', `cat > ${tmpFile}`], { input: metricInput, encoding: 'utf-8' });

      const result = awsCli([
        'cloudwatch', 'get-metric-data',
        '--cli-input-json', `file://${tmpFile}`,
      ], 30000);

      try { execFileSync('rm', [tmpFile]); } catch {}

      if (!result) {
        return NextResponse.json({ models: [], metrics: [], totalCost: 0 });
      }

      // Parse results per model / 모델별 결과 파싱
      const modelMetrics: Record<string, any> = {};
      for (let mi = 0; mi < models.length; mi++) {
        const modelId = models[mi];
        modelMetrics[modelId] = {
          modelId,
          label: getModelLabel(modelId),
          pricing: getModelPricing(modelId),
          invocations: 0,
          inputTokens: 0,
          outputTokens: 0,
          avgLatencyMs: 0,
          clientErrors: 0,
          serverErrors: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          // Time series for charts / 차트용 시계열 데이터
          timeSeries: { invocations: [] as any[], inputTokens: [] as any[], outputTokens: [] as any[] },
        };
      }

      for (const r of (result.MetricDataResults || [])) {
        const match = r.Id.match(/^(.+)_m(\d+)$/);
        if (!match) continue;
        const metricKey = match[1];
        const mi = Number(match[2]);
        if (mi >= models.length) continue;
        const modelId = models[mi];
        const values = r.Values || [];
        const timestamps = r.Timestamps || [];
        const total = values.reduce((s: number, v: number) => s + v, 0);

        switch (metricKey) {
          case 'inv':
            modelMetrics[modelId].invocations = total;
            modelMetrics[modelId].timeSeries.invocations = timestamps.map((t: string, i: number) => ({
              timestamp: t, value: values[i] || 0,
            })).reverse();
            break;
          case 'in_tok':
            modelMetrics[modelId].inputTokens = total;
            modelMetrics[modelId].timeSeries.inputTokens = timestamps.map((t: string, i: number) => ({
              timestamp: t, value: values[i] || 0,
            })).reverse();
            break;
          case 'out_tok':
            modelMetrics[modelId].outputTokens = total;
            modelMetrics[modelId].timeSeries.outputTokens = timestamps.map((t: string, i: number) => ({
              timestamp: t, value: values[i] || 0,
            })).reverse();
            break;
          case 'latency':
            modelMetrics[modelId].avgLatencyMs = values.length > 0
              ? Math.round(values.reduce((s: number, v: number) => s + v, 0) / values.length)
              : 0;
            break;
          case 'err4xx':
            modelMetrics[modelId].clientErrors = total;
            break;
          case 'err5xx':
            modelMetrics[modelId].serverErrors = total;
            break;
          case 'cache_read':
            modelMetrics[modelId].cacheReadTokens = total;
            break;
          case 'cache_write':
            modelMetrics[modelId].cacheWriteTokens = total;
            break;
        }
      }

      // Calculate costs / 비용 계산
      const metricsArray = Object.values(modelMetrics).map((m: any) => {
        const pricing = m.pricing;
        const inputCost = (m.inputTokens * pricing.input) / 1_000_000;
        const outputCost = (m.outputTokens * pricing.output) / 1_000_000;
        const cacheReadCost = (m.cacheReadTokens * pricing.cacheRead) / 1_000_000;
        const cacheWriteCost = (m.cacheWriteTokens * pricing.cacheWrite) / 1_000_000;
        // Cache savings: cache read tokens would have cost full input price / 캐시 절감: 캐시 읽기 토큰은 전체 입력 가격이었을 것
        const cacheSavings = (m.cacheReadTokens * (pricing.input - pricing.cacheRead)) / 1_000_000;
        return {
          ...m,
          inputCost,
          outputCost,
          cacheReadCost,
          cacheWriteCost,
          cacheSavings,
          totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
        };
      }).filter((m: any) => m.invocations > 0 || m.inputTokens > 0)
        .sort((a: any, b: any) => b.totalCost - a.totalCost);

      const totalCost = metricsArray.reduce((s: number, m: any) => s + m.totalCost, 0);
      const totalCacheSavings = metricsArray.reduce((s: number, m: any) => s + m.cacheSavings, 0);

      // AWSops app-level token stats / AWSops 앱 수준 토큰 통계
      const appStats = getStats();
      const awsopsUsage = {
        totalInputTokens: appStats.totalInputTokens || 0,
        totalOutputTokens: appStats.totalOutputTokens || 0,
        totalCalls: appStats.totalCalls || 0,
        tokensByModel: appStats.tokensByModel || {},
      };

      return NextResponse.json({
        metrics: metricsArray,
        totalCost,
        totalCacheSavings,
        range,
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        awsopsUsage,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get Bedrock metrics';
      return NextResponse.json({ error: message, metrics: [], totalCost: 0 }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
