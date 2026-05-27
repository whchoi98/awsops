// Alert diagnosis — investigation orchestrator
// 알림 진단 — 조사 오케스트레이터
// ADR-009: Selects investigation strategy, runs collectors + datasource queries + change detection,
// invokes Bedrock Opus for root cause analysis, dispatches results.

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource, getAlertDiagnosisConfig, getSlackConfig, getConfig } from '@/lib/app-config';
import { runQuery } from '@/lib/steampipe';
import { setIncidentHandler, updateIncident } from '@/lib/alert-correlation';
import { sendSlackAlert } from '@/lib/slack-notification';
import { notifyAlertDiagnosis } from '@/lib/sns-notification';
import { saveAlertDiagnosis, findSimilarIncidents } from '@/lib/alert-knowledge';
import type { Incident, DiagnosisResult, AlertEvent } from '@/lib/alert-types';
import type { AlertContext, CollectorResult, SendFn } from '@/lib/collectors/types';

const BEDROCK_REGION = 'ap-northeast-2';
const ANALYSIS_MODEL = 'global.anthropic.claude-sonnet-4-6';
const MAX_CONTEXT_CHARS = 60_000;

// --- Initialization ---

let initialized = false;

export function ensureAlertDiagnosisStarted(): void {
  if (initialized) return;
  initialized = true;
  setIncidentHandler(investigateIncident);
  console.log('[AlertDiagnosis] Investigation handler registered');
}

// --- Investigation Strategy ---

type CollectorKey = 'incident' | 'trace-analyze' | 'eks-optimize' | 'db-optimize' | 'msk-optimize' | 'idle-scan' | 'network-flow';

interface InvestigationPlan {
  collectors: CollectorKey[];
  prometheusQueries: string[];
  lokiQueries: string[];
  changeDetection: boolean;
}

function buildInvestigationPlan(incident: Incident): InvestigationPlan {
  const plan: InvestigationPlan = {
    collectors: ['incident'], // always run the base incident collector
    prometheusQueries: [],
    lokiQueries: [],
    changeDetection: getAlertDiagnosisConfig().includeChangeDetection !== false,
  };

  // Analyze all alert signals to determine additional collectors
  const allLabels = incident.alerts.flatMap(a => Object.entries(a.labels));
  const allMetricNames = incident.alerts.map(a => a.metric?.name || '').filter(Boolean);
  const allMetricNS = incident.alerts.map(a => a.metric?.namespace || '').filter(Boolean);
  const allNames = incident.alerts.map(a => a.alertName.toLowerCase());

  const signals = [...allNames, ...allMetricNames.map(n => n.toLowerCase()), ...allMetricNS.map(n => n.toLowerCase())];
  const labelKeys = allLabels.map(([k]) => k.toLowerCase());
  const labelValues = allLabels.map(([, v]) => v.toLowerCase());
  const text = [...signals, ...labelKeys, ...labelValues].join(' ');

  // EKS / Kubernetes signals
  if (text.match(/pod|container|k8s|kube|deployment|replica|oom|crash|restart|eks|node_/)) {
    plan.collectors.push('eks-optimize');
  }

  // Database signals
  if (text.match(/rds|aurora|elasticache|redis|valkey|memcached|opensearch|database|db|connection|iops|free.*memory/)) {
    plan.collectors.push('db-optimize');
  }

  // MSK / Kafka signals
  if (text.match(/msk|kafka|consumer.*lag|broker|topic|partition/)) {
    plan.collectors.push('msk-optimize');
  }

  // Tracing signals
  if (text.match(/latency|p99|p95|duration|trace|5xx|error.*rate|http|request/)) {
    plan.collectors.push('trace-analyze');
  }

  // Network signals
  if (text.match(/network|flow.*log|vpc|security.*group|nacl|reject|packet/)) {
    plan.collectors.push('network-flow');
  }

  // Build targeted Prometheus queries based on alert context
  for (const alert of incident.alerts) {
    if (alert.metric?.name) {
      const metricName = sanitizeMetricName(alert.metric.name);
      plan.prometheusQueries.push(
        `topk(10, ${metricName}{${buildPromLabels(alert)}})`
      );
    }
    // Service-level error rate
    if (alert.labels.service || alert.labels.job) {
      const svc = sanitizePromValue(alert.labels.service || alert.labels.job || '');
      plan.prometheusQueries.push(
        `sum(rate(http_requests_total{service="${svc}",code=~"5.."}[5m]))`
      );
    }
  }

  // Loki: targeted log queries
  for (const alert of incident.alerts) {
    if (alert.labels.namespace && alert.labels.pod) {
      plan.lokiQueries.push(`{namespace="${sanitizePromValue(alert.labels.namespace)}",pod="${sanitizePromValue(alert.labels.pod)}"} |= "error"`);
    } else if (alert.labels.service) {
      plan.lokiQueries.push(`{service="${sanitizePromValue(alert.labels.service)}"} |= "error"`);
    } else if (alert.labels.namespace) {
      plan.lokiQueries.push(`{namespace="${sanitizePromValue(alert.labels.namespace)}"} |~ "error|fatal|panic"`);
    }
  }

  // Deduplicate
  plan.collectors = Array.from(new Set(plan.collectors));
  plan.prometheusQueries = Array.from(new Set(plan.prometheusQueries)).slice(0, 5);
  plan.lokiQueries = Array.from(new Set(plan.lokiQueries)).slice(0, 3);

  return plan;
}

// Sanitize PromQL/LogQL label values — prevent injection
function sanitizePromValue(val: string): string {
  return val.replace(/["\\\n\r}]/g, '').slice(0, 200);
}

// Sanitize PromQL metric name — must match [a-zA-Z_:][a-zA-Z0-9_:]*
function sanitizeMetricName(name: string): string {
  return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name) ? name : 'unknown_metric';
}

function buildPromLabels(alert: AlertEvent): string {
  const parts: string[] = [];
  if (alert.labels.namespace) parts.push(`namespace="${sanitizePromValue(alert.labels.namespace)}"`);
  if (alert.labels.service) parts.push(`service="${sanitizePromValue(alert.labels.service)}"`);
  if (alert.labels.pod) parts.push(`pod="${sanitizePromValue(alert.labels.pod)}"`);
  if (alert.labels.instance) parts.push(`instance="${sanitizePromValue(alert.labels.instance)}"`);
  return parts.join(',');
}

// --- Investigation Execution ---

async function investigateIncident(incident: Incident): Promise<void> {
  const startTime = Date.now();
  console.log(`[AlertDiagnosis] Starting investigation for ${incident.id} (${incident.alerts.length} alerts)`);

  try {
    const plan = buildInvestigationPlan(incident);
    const config = getAlertDiagnosisConfig();
    const timeout = (config.investigationTimeoutSeconds || 120) * 1000;

    // Phase 1: Parallel data collection (with timeout)
    let timeoutId: NodeJS.Timeout;
    const collectionResult = await Promise.race([
      collectInvestigationData(plan, incident),
      new Promise<InvestigationData>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Investigation timeout')), timeout);
      }),
    ]);
    clearTimeout(timeoutId!);

    // Phase 1.5: Knowledge base — find similar past incidents
    let similarIncidents: string = '';
    if (config.knowledgeBaseEnabled !== false) {
      try {
        const similar = await findSimilarIncidents(incident, 3);
        if (similar.length > 0) {
          similarIncidents = similar.map(s =>
            `- ${s.incidentId} (${s.timestamp}): ${s.rootCause} [${s.confidence}] — ${s.rootCauseCategory}`
          ).join('\n');
        }
      } catch { /* knowledge base optional */ }
    }

    // Phase 2: Bedrock Opus analysis
    const isEn = false; // default Korean
    const diagnosis = await analyzeWithBedrock(incident, collectionResult, similarIncidents, isEn);

    // Update incident with results
    const result: DiagnosisResult = {
      incidentId: incident.id,
      markdown: diagnosis.content,
      rootCause: diagnosis.rootCause,
      rootCauseCategory: diagnosis.category,
      confidence: diagnosis.confidence,
      investigationSources: collectionResult.sources,
      processingTimeMs: Date.now() - startTime,
      model: ANALYSIS_MODEL,
      inputTokens: diagnosis.inputTokens,
      outputTokens: diagnosis.outputTokens,
    };

    updateIncident(incident.id, {
      status: 'analyzed',
      analyzedAt: new Date().toISOString(),
      diagnosisResult: result,
    });

    console.log(`[AlertDiagnosis] Investigation complete for ${incident.id} in ${result.processingTimeMs}ms — ${result.rootCause}`);

    // Phase 3: Dispatch results
    await dispatchResults(incident, result);

    // Phase 4: Save to knowledge base (JSON, source of truth during Phase 1)
    try {
      await saveAlertDiagnosis(incident, result);
    } catch (err) {
      console.error('[AlertDiagnosis] Failed to save to knowledge base:', err instanceof Error ? err.message : err);
    }
    // ADR-030 Phase 1 dual-write — fire-and-forget shadow into Aurora's
    // alert_diagnosis table. Idempotent on incident_id; failures land in
    // /api/parity drift and never block dispatch.
    void import('@/lib/db/alert-diagnosis-writer')
      .then((m) => m.fireAndForgetSaveDiagnosis(incident, result))
      .catch(() => { /* dynamic import failure is non-fatal */ });
  } catch (err) {
    console.error(`[AlertDiagnosis] Investigation failed for ${incident.id}:`, err instanceof Error ? err.message : err);
    updateIncident(incident.id, { status: 'analyzed' }); // mark as done even on failure
  }
}

// --- Data Collection ---

interface InvestigationData {
  collectorResults: Record<string, CollectorResult>;
  prometheusResults: Record<string, unknown[]>;
  lokiResults: string[];
  recentChanges: RecentChanges;
  sources: string[];
}

interface RecentChanges {
  cloudtrailEvents: Record<string, unknown>[];
  k8sRollouts: Record<string, unknown>[];
}

function buildAlertContext(incident: Incident): AlertContext {
  const namespaces = new Set<string>();
  const alertNames = new Set<string>();
  let earliest: string | undefined;

  for (const alert of incident.alerts) {
    if (alert.labels.namespace) namespaces.add(alert.labels.namespace);
    if (alert.alertName) alertNames.add(alert.alertName);
    if (!earliest || alert.timestamp < earliest) earliest = alert.timestamp;
  }

  return {
    services: incident.affectedServices,
    resources: incident.affectedResources,
    alertNames: Array.from(alertNames),
    namespaces: Array.from(namespaces),
    since: earliest,
  };
}

async function collectInvestigationData(plan: InvestigationPlan, incident: Incident): Promise<InvestigationData> {
  const data: InvestigationData = {
    collectorResults: {},
    prometheusResults: {},
    lokiResults: [],
    recentChanges: { cloudtrailEvents: [], k8sRollouts: [] },
    sources: [],
  };

  // Null SSE sender (we're running in background, not streaming to UI)
  const nullSend: SendFn = () => {};

  // Build alert-scoped context so collectors can narrow their queries to the
  // firing alert's services/resources/namespaces (ADR-009).
  const alertContext = buildAlertContext(incident);

  // Run all collections in parallel
  const tasks: Promise<void>[] = [];

  // 1. Collectors
  for (const key of plan.collectors) {
    tasks.push(
      (async () => {
        try {
          const collectorMod = await import(/* webpackInclude: /\.(ts|tsx|js)$/ */ `@/lib/collectors/${key}`);
          const collector = collectorMod.default as import('@/lib/collectors/types').Collector;
          const result = await collector.collect(nullSend, undefined, false, alertContext);
          data.collectorResults[key] = result;
          data.sources.push(...result.queriedResources);
        } catch (err) {
          console.warn(`[AlertDiagnosis] Collector ${key} failed:`, err instanceof Error ? err.message : err);
        }
      })()
    );
  }

  // 2. Targeted Prometheus queries
  const promDs = getDefaultDatasource('prometheus');
  if (promDs && plan.prometheusQueries.length > 0) {
    tasks.push(
      (async () => {
        for (const query of plan.prometheusQueries) {
          try {
            const result = await queryDatasource(promDs, query, { start: '1h', step: '60' });
            if (result.rows.length > 0) {
              data.prometheusResults[query] = result.rows.slice(0, 20);
              if (!data.sources.includes('prometheus-targeted')) data.sources.push('prometheus-targeted');
            }
          } catch { /* skip failed query */ }
        }
      })()
    );
  }

  // 3. Targeted Loki queries
  const lokiDs = getDefaultDatasource('loki');
  if (lokiDs && plan.lokiQueries.length > 0) {
    tasks.push(
      (async () => {
        for (const query of plan.lokiQueries) {
          try {
            const result = await queryDatasource(lokiDs, query, { start: '1h', limit: 30 });
            if (result.rows.length > 0) {
              const lines = result.rows.map(r => {
                const line = r.line || r[2] || JSON.stringify(r);
                return typeof line === 'string' ? line.slice(0, 500) : JSON.stringify(line).slice(0, 500);
              });
              data.lokiResults.push(...lines);
              if (!data.sources.includes('loki-targeted')) data.sources.push('loki-targeted');
            }
          } catch { /* skip failed query */ }
        }
      })()
    );
  }

  // 4. Change detection
  if (plan.changeDetection) {
    tasks.push(
      (async () => {
        try {
          data.recentChanges = await detectRecentChanges(incident);
          if (data.recentChanges.cloudtrailEvents.length > 0) data.sources.push('cloudtrail');
          if (data.recentChanges.k8sRollouts.length > 0) data.sources.push('k8s-rollouts');
        } catch { /* change detection optional */ }
      })()
    );
  }

  await Promise.allSettled(tasks);
  data.sources = Array.from(new Set(data.sources));
  return data;
}

// --- Change Detection ---

async function detectRecentChanges(_incident: Incident): Promise<RecentChanges> {
  const changes: RecentChanges = { cloudtrailEvents: [], k8sRollouts: [] };

  const tasks: Promise<void>[] = [];

  // CloudTrail: recent mutating events (last 2 hours)
  tasks.push(
    (async () => {
      try {
        const result = await runQuery(`
          SELECT event_name, event_time, event_source, username,
                 resources, request_parameters::text AS params
          FROM aws_cloudtrail_trail_event
          WHERE event_time > now() - interval '2 hours'
            AND read_only = false
            AND event_name NOT LIKE 'Describe%'
            AND event_name NOT LIKE 'Get%'
            AND event_name NOT LIKE 'List%'
          ORDER BY event_time DESC
          LIMIT 30
        `);
        changes.cloudtrailEvents = result.rows || [];
      } catch { /* CloudTrail may not be available */ }
    })()
  );

  // K8s: recent deployment changes
  tasks.push(
    (async () => {
      try {
        const result = await runQuery(`
          SELECT name, namespace, creation_timestamp,
                 annotations::text AS annotations,
                 conditions::text AS conditions
          FROM kubernetes_deployment
          WHERE conditions::text LIKE '%Progressing%'
          ORDER BY creation_timestamp DESC
          LIMIT 20
        `);
        changes.k8sRollouts = result.rows || [];
      } catch { /* K8s may not be available */ }
    })()
  );

  await Promise.allSettled(tasks);
  return changes;
}

// --- Bedrock Analysis ---

interface BedrockAnalysis {
  content: string;
  rootCause: string;
  category: DiagnosisResult['rootCauseCategory'];
  confidence: DiagnosisResult['confidence'];
  inputTokens?: number;
  outputTokens?: number;
}

async function analyzeWithBedrock(
  incident: Incident,
  data: InvestigationData,
  similarIncidents: string,
  isEn: boolean,
): Promise<BedrockAnalysis> {
  const lang = isEn ? 'English' : 'Korean';
  const systemPrompt = buildAnalysisPrompt(lang);
  const userPrompt = buildUserPrompt(incident, data, similarIncidents);

  const client = new BedrockRuntimeClient({ region: BEDROCK_REGION });
  const response = await client.send(new InvokeModelCommand({
    modelId: ANALYSIS_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const content = result.content?.[0]?.text || '';
  const inputTokens = result.usage?.input_tokens;
  const outputTokens = result.usage?.output_tokens;

  // Extract structured metadata from the analysis
  const rootCause = extractField(content, 'ROOT_CAUSE') || 'Analysis complete — see details';
  const category = extractCategory(content);
  const confidence = extractConfidence(content);

  return { content, rootCause, category, confidence, inputTokens, outputTokens };
}

function buildAnalysisPrompt(lang: string): string {
  return `You are an expert SRE performing automated incident diagnosis for AWSops.

## Output Requirements
1. Begin your response with exactly this line (for machine parsing):
   ROOT_CAUSE: <one-line root cause summary>
   CATEGORY: <deployment|capacity|configuration|dependency|security|infrastructure|unknown>
   CONFIDENCE: <high|medium|low>

2. Then provide the full analysis in ${lang}:

### 1. Timeline Reconstruction
Build a chronological timeline of events leading to this incident.
Correlate timestamps across all data sources. Identify the trigger event.

### 2. Root Cause Analysis
- Primary root cause with evidence chain
- Which specific data points support this conclusion
- Alternative hypotheses if confidence is not high

### 3. Impact Assessment
- Affected services and user-facing impact
- Blast radius estimation

### 4. Immediate Remediation
- Step-by-step actions with exact commands (kubectl, AWS CLI)
- Rollback procedure if a recent change is the root cause

### 5. Prevention
- Monitoring gaps identified
- Suggested alerts or configuration changes

## Rules
- Correlate timestamps across sources to build a coherent timeline
- If a source has no data, note it but don't treat it as "no issues"
- Be specific and actionable. Every recommendation must include exact commands.
- IMPORTANT: If recent changes (CloudTrail/K8s rollouts) correlate with the alert timing, prioritize them as root cause candidates.`;
}

function buildUserPrompt(incident: Incident, data: InvestigationData, similarIncidents: string): string {
  const parts: string[] = [];

  // Incident context
  parts.push(`## Incident: ${incident.id}`);
  parts.push(`Severity: ${incident.severity.toUpperCase()}`);
  parts.push(`Created: ${incident.createdAt}`);
  parts.push(`Correlation: ${incident.correlationReason}`);
  parts.push(`Affected Services: ${incident.affectedServices.join(', ') || 'unknown'}`);
  parts.push(`Affected Resources: ${incident.affectedResources.join(', ') || 'unknown'}`);
  parts.push('');

  // Alert details
  parts.push('## Alerts');
  for (const alert of incident.alerts) {
    parts.push(`- [${alert.severity.toUpperCase()}] ${alert.alertName} (${alert.source})`);
    parts.push(`  Message: ${alert.message}`);
    parts.push(`  Time: ${alert.timestamp}`);
    if (alert.metric?.name) {
      parts.push(`  Metric: ${alert.metric.name} (${alert.metric.namespace || ''}) — value: ${alert.metric.value ?? 'N/A'}, threshold: ${alert.metric.threshold ?? 'N/A'}`);
    }
    if (Object.keys(alert.labels).length > 0) {
      parts.push(`  Labels: ${JSON.stringify(alert.labels)}`);
    }
  }
  parts.push('');

  // Collector results (formatted as JSON sections)
  const maxPerCollector = Math.floor(MAX_CONTEXT_CHARS / Math.max(Object.keys(data.collectorResults).length, 1));
  for (const [key, result] of Object.entries(data.collectorResults)) {
    parts.push(`## Collector: ${key}`);
    parts.push(`Sources used: ${result.usedTools.join(', ')}`);
    const sectionsJson = JSON.stringify(result.sections, null, 2);
    parts.push(sectionsJson.slice(0, maxPerCollector));
    if (sectionsJson.length > maxPerCollector) parts.push('... [truncated]');
    parts.push('');
  }

  // Targeted Prometheus results
  if (Object.keys(data.prometheusResults).length > 0) {
    parts.push('## Targeted Prometheus Queries');
    for (const [query, rows] of Object.entries(data.prometheusResults)) {
      parts.push(`Query: ${query}`);
      parts.push(JSON.stringify(rows.slice(0, 10), null, 2));
      parts.push('');
    }
  }

  // Targeted Loki logs
  if (data.lokiResults.length > 0) {
    parts.push('## Targeted Loki Logs');
    parts.push(data.lokiResults.slice(0, 30).join('\n'));
    parts.push('');
  }

  // Recent changes
  if (data.recentChanges.cloudtrailEvents.length > 0) {
    parts.push('## Recent CloudTrail Events (last 2h, mutating only)');
    parts.push(JSON.stringify(data.recentChanges.cloudtrailEvents.slice(0, 15), null, 2));
    parts.push('');
  }
  if (data.recentChanges.k8sRollouts.length > 0) {
    parts.push('## Recent Kubernetes Deployments');
    parts.push(JSON.stringify(data.recentChanges.k8sRollouts.slice(0, 10), null, 2));
    parts.push('');
  }

  // Similar past incidents
  if (similarIncidents) {
    parts.push('## Similar Past Incidents');
    parts.push(similarIncidents);
    parts.push('');
  }

  // Investigation sources summary
  parts.push(`## Investigation Sources: ${data.sources.join(', ')}`);

  // Truncate to max context
  const full = parts.join('\n');
  return full.length > MAX_CONTEXT_CHARS ? full.slice(0, MAX_CONTEXT_CHARS) + '\n\n[... truncated]' : full;
}

// --- Result Dispatch ---

async function dispatchResults(incident: Incident, result: DiagnosisResult): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  // Slack
  const slackConfig = getSlackConfig();
  if (slackConfig) {
    tasks.push(
      sendSlackAlert(incident, result, slackConfig).catch(err =>
        console.error('[AlertDiagnosis] Slack dispatch failed:', err instanceof Error ? err.message : err)
      )
    );
  }

  // SNS Email
  const config = getConfig();
  if (config.notificationEnabled && config.snsTopicArn) {
    tasks.push(
      notifyAlertDiagnosis({ incident, result }).catch(err =>
        console.error('[AlertDiagnosis] SNS dispatch failed:', err instanceof Error ? err.message : err)
      )
    );
  }

  await Promise.allSettled(tasks);
}

// --- Extraction Helpers ---

function extractField(content: string, field: string): string | null {
  const regex = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractCategory(content: string): DiagnosisResult['rootCauseCategory'] {
  const raw = extractField(content, 'CATEGORY');
  const valid: DiagnosisResult['rootCauseCategory'][] = [
    'deployment', 'capacity', 'configuration', 'dependency', 'security', 'infrastructure', 'unknown',
  ];
  return valid.includes(raw as DiagnosisResult['rootCauseCategory'])
    ? (raw as DiagnosisResult['rootCauseCategory'])
    : 'unknown';
}

function extractConfidence(content: string): DiagnosisResult['confidence'] {
  const raw = extractField(content, 'CONFIDENCE');
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}
