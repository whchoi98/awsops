// Network Flow Collector — ClickHouse VPC Flow Logs + CloudWatch network metrics
// 네트워크 흐름 컬렉터: ClickHouse VPC Flow Log + CloudWatch 네트워크 메트릭
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource } from '@/lib/app-config';
import type { Collector, CollectorResult, SendFn } from './types';

// ============================================================================
// ClickHouse VPC Flow Log queries
// ============================================================================

const FLOW_LOG_TOP_TALKERS = `
SELECT srcaddr, dstaddr, dstport, protocol,
       sum(bytes) as total_bytes, sum(packets) as total_packets, count() as flow_count
FROM vpc_flow_logs
WHERE start >= now() - INTERVAL 1 HOUR
GROUP BY srcaddr, dstaddr, dstport, protocol
ORDER BY total_bytes DESC
LIMIT 50
`;

const FLOW_LOG_REJECTED = `
SELECT srcaddr, dstaddr, dstport, protocol, action,
       count() as reject_count, sum(packets) as total_packets
FROM vpc_flow_logs
WHERE action = 'REJECT' AND start >= now() - INTERVAL 1 HOUR
GROUP BY srcaddr, dstaddr, dstport, protocol, action
ORDER BY reject_count DESC
LIMIT 30
`;

const FLOW_LOG_CROSS_AZ = `
SELECT az_id AS src_az, srcaddr, dstaddr,
       sum(bytes) as total_bytes, count() as flow_count
FROM vpc_flow_logs
WHERE start >= now() - INTERVAL 1 HOUR
  AND flow_direction = 'ingress'
GROUP BY az_id, srcaddr, dstaddr
HAVING total_bytes > 1000000
ORDER BY total_bytes DESC
LIMIT 30
`;

// ============================================================================
// Collector implementation
// ============================================================================

const networkFlowCollector: Collector = {
  displayName: 'Network Flow Analyzer',

  async collect(send: SendFn, _accountId?: string, isEn?: boolean): Promise<CollectorResult> {
    const clickhouseDs = getDefaultDatasource('clickhouse');
    const usedTools: string[] = [];
    const queriedResources: string[] = [];

    let topTalkers: any[] = [];
    let rejectedFlows: any[] = [];
    let crossAzTraffic: any[] = [];

    // ── ClickHouse VPC Flow Logs ──
    if (clickhouseDs) {
      send('status', { step: 'netflow-ch', message: isEn
        ? `🔍 Querying VPC Flow Logs from ${clickhouseDs.name}...`
        : `🔍 ${clickhouseDs.name}에서 VPC Flow Log 조회 중...` });

      const queries = [
        { name: 'topTalkers', sql: FLOW_LOG_TOP_TALKERS },
        { name: 'rejected', sql: FLOW_LOG_REJECTED },
        { name: 'crossAz', sql: FLOW_LOG_CROSS_AZ },
      ];

      const results = await Promise.allSettled(
        queries.map(q => queryDatasource(clickhouseDs, q.sql, {}))
      );

      topTalkers = results[0].status === 'fulfilled' ? results[0].value.rows : [];
      rejectedFlows = results[1].status === 'fulfilled' ? results[1].value.rows : [];
      crossAzTraffic = results[2].status === 'fulfilled' ? results[2].value.rows : [];

      const totalRows = topTalkers.length + rejectedFlows.length + crossAzTraffic.length;
      if (totalRows > 0) {
        usedTools.push(`ClickHouse: ${totalRows} flow log records`);
        queriedResources.push('clickhouse');
      }

      send('status', { step: 'netflow-ch-done', message: isEn
        ? `✅ VPC Flow Logs: ${topTalkers.length} top talkers, ${rejectedFlows.length} rejected, ${crossAzTraffic.length} cross-AZ`
        : `✅ VPC Flow Log: 상위 ${topTalkers.length}개, 거부 ${rejectedFlows.length}개, Cross-AZ ${crossAzTraffic.length}개` });
    } else {
      send('status', { step: 'netflow-no-ch', message: isEn
        ? '⚠️ No ClickHouse datasource configured. Skipping VPC Flow Log analysis.'
        : '⚠️ ClickHouse 데이터소스 미설정. VPC Flow Log 분석 생략.' });
    }

    return {
      sections: { topTalkers, rejectedFlows, crossAzTraffic, hasClickhouse: !!clickhouseDs },
      usedTools,
      queriedResources,
      viaSummary: clickhouseDs
        ? `Network Flow (${topTalkers.length} talkers, ${rejectedFlows.length} rejected, ${clickhouseDs.name})`
        : 'Network Flow (no datasource)',
    };
  },

  formatContext(data: CollectorResult): string {
    const { topTalkers, rejectedFlows, crossAzTraffic, hasClickhouse } = data.sections;
    const sections: string[] = [];

    if (!hasClickhouse && (!topTalkers || topTalkers.length === 0)) {
      return '\n\n--- No VPC Flow Log data available (ClickHouse not configured) ---';
    }

    if (topTalkers?.length > 0) {
      sections.push('## Top Traffic Flows (last 1h, by bytes)');
      sections.push(`\`\`\`json\n${JSON.stringify(topTalkers.slice(0, 30), null, 2)}\n\`\`\``);
    }

    if (rejectedFlows?.length > 0) {
      sections.push('## Rejected Flows (last 1h)');
      sections.push(`\`\`\`json\n${JSON.stringify(rejectedFlows.slice(0, 20), null, 2)}\n\`\`\``);
    }

    if (crossAzTraffic?.length > 0) {
      sections.push('## Cross-AZ Traffic (last 1h, >1MB)');
      sections.push(`\`\`\`json\n${JSON.stringify(crossAzTraffic.slice(0, 20), null, 2)}\n\`\`\``);
    }

    if (sections.length === 0) return '\n\n--- No VPC Flow Log data collected ---';
    return '\n\n--- VPC FLOW LOG DATA (ClickHouse) ---\n' + sections.join('\n\n');
  },

  analysisPrompt: '', // Not used standalone — combined in report prompt
};

export default networkFlowCollector;
