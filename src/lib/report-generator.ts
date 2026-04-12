// Report Data Collection Orchestrator
// 종합진단 리포트용 데이터 수집 오케스트레이터
import { batchQuery, checkCostAvailability } from '@/lib/steampipe';
import { queries as costQ } from '@/lib/queries/cost';
import { getAccountById } from '@/lib/app-config';
import type { SendFn, CollectorResult } from '@/lib/collectors/types';

// ============================================================================
// Types
// ============================================================================

export interface ReportData {
  timestamp: string;
  accountId?: string;
  accountAlias?: string;
  cost: { serviceBreakdown: any[]; monthlyTrend: any[]; } | null;
  compute: { ec2Instances: any[]; lambdaFunctions: any[]; ecsClusters: any[]; } | null;
  eks: CollectorResult | null;
  database: CollectorResult | null;
  network: {
    vpcs: any[]; subnets: any[]; natGateways: any[]; loadBalancers: any[];
    routeTables: any[]; vpcPeerings: any[]; transitGateways: any[];
  } | null;
  storage: { s3Buckets: any[]; ebsVolumes: any[]; ebsSummary: any[]; } | null;
  security: { publicS3: any[]; openSgs: any[]; unencryptedEbs: any[]; iamSummary: any; complianceScore: any | null; } | null;
  idle: CollectorResult | null;
  msk: CollectorResult | null;
  rdsInstances: any[];
  mskClusters: any[];
}

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const noop: SendFn = () => {};

// ============================================================================
// Infrastructure SQL queries
// ============================================================================

const infraQueries: Record<string, string> = {
  ec2: `SELECT instance_id, instance_type, instance_state, region, account_id, tags ->> 'Name' as name FROM aws_ec2_instance ORDER BY instance_state`,
  lambda: `SELECT function_name, runtime, memory_size, timeout, code_size, region, account_id FROM aws_lambda_function ORDER BY last_modified DESC LIMIT 100`,
  ecs: `SELECT cluster_name, status, running_tasks_count, active_services_count, account_id, region FROM aws_ecs_cluster`,
  vpcs: `SELECT vpc_id, cidr_block, is_default, state, account_id, region, tags ->> 'Name' as name FROM aws_vpc`,
  subnets: `SELECT subnet_id, vpc_id, cidr_block, availability_zone, map_public_ip_on_launch, account_id FROM aws_vpc_subnet`,
  natGateways: `SELECT nat_gateway_id, state, vpc_id, subnet_id, account_id, region FROM aws_vpc_nat_gateway`,
  albs: `SELECT arn, name, type, state_code, account_id, region FROM aws_ec2_application_load_balancer`,
  s3: `SELECT name, region, creation_date, versioning, account_id FROM aws_s3_bucket`,
  ebs: `SELECT volume_id, volume_type, size, state, iops, encrypted, account_id, region FROM aws_ebs_volume`,
  ebsSummary: `SELECT volume_type, COUNT(*) as count, SUM(size) as total_gb FROM aws_ebs_volume GROUP BY volume_type`,
  publicS3: `SELECT name, region, account_id FROM aws_s3_bucket WHERE bucket_policy_is_public = true`,
  openSgs: `SELECT group_id, group_name, vpc_id, account_id, region FROM aws_vpc_security_group WHERE group_id IN (SELECT DISTINCT group_id FROM aws_vpc_security_group_rule WHERE cidr_ipv4 = '0.0.0.0/0' AND type = 'ingress')`,
  unencryptedEbs: `SELECT volume_id, volume_type, size, account_id, region FROM aws_ebs_volume WHERE NOT encrypted`,
  iamUsers: `SELECT COUNT(*) as count FROM aws_iam_user`,
  iamRoles: `SELECT COUNT(*) as count FROM aws_iam_role`,
  // Additional queries for 15-section report
  // 15섹션 리포트용 추가 쿼리
  routeTables: `SELECT route_table_id, vpc_id, associations, routes, account_id, region FROM aws_vpc_route_table`,
  vpcPeerings: `SELECT id, status_code, requester_vpc_id, accepter_vpc_id, account_id, region FROM aws_vpc_peering_connection`,
  transitGateways: `SELECT transit_gateway_id, state, owner_id, account_id, region FROM aws_ec2_transit_gateway`,
  rdsInstances: `SELECT db_instance_identifier, db_instance_class AS class, engine, engine_version, status, multi_az, publicly_accessible, storage_encrypted, allocated_storage, account_id, region FROM aws_rds_db_instance`,
  mskClusters: `SELECT cluster_name, state, cluster_type, arn, account_id, region FROM aws_msk_cluster`,
};

// ============================================================================
// Main orchestrator
// ============================================================================

export async function collectReportData(
  accountId?: string,
  send: SendFn = noop,
  isEn = false,
): Promise<ReportData> {
  const account = accountId ? getAccountById(accountId) : undefined;
  const qOpts = accountId ? { accountId } : undefined;

  // ── Phase 1: Steampipe bulk queries ──
  send('status', { step: 'infra', message: isEn
    ? 'Collecting infrastructure inventory...'
    : '인프라 인벤토리 수집 중...' });

  const infraResults = await batchQuery(infraQueries, qOpts);

  const compute = {
    ec2Instances: infraResults.ec2?.rows || [],
    lambdaFunctions: infraResults.lambda?.rows || [],
    ecsClusters: infraResults.ecs?.rows || [],
  };

  const network = {
    vpcs: infraResults.vpcs?.rows || [],
    subnets: infraResults.subnets?.rows || [],
    natGateways: infraResults.natGateways?.rows || [],
    loadBalancers: infraResults.albs?.rows || [],
    routeTables: infraResults.routeTables?.rows || [],
    vpcPeerings: infraResults.vpcPeerings?.rows || [],
    transitGateways: infraResults.transitGateways?.rows || [],
  };

  const storage = {
    s3Buckets: infraResults.s3?.rows || [],
    ebsVolumes: infraResults.ebs?.rows || [],
    ebsSummary: infraResults.ebsSummary?.rows || [],
  };

  const iamUserCount = (infraResults.iamUsers?.rows?.[0] as any)?.count ?? 0;
  const iamRoleCount = (infraResults.iamRoles?.rows?.[0] as any)?.count ?? 0;

  const rdsInstances = infraResults.rdsInstances?.rows || [];
  const mskClusters = infraResults.mskClusters?.rows || [];

  // ── Phase 2: Cost queries (conditional) ──
  send('status', { step: 'cost', message: isEn
    ? 'Checking cost data availability...'
    : '비용 데이터 가용성 확인 중...' });

  let cost: ReportData['cost'] = null;
  const costCheck = await checkCostAvailability(false, accountId);

  if (costCheck.available) {
    send('status', { step: 'cost-query', message: isEn
      ? 'Collecting cost breakdown...'
      : '비용 내역 수집 중...' });

    const costResults = await batchQuery(
      { serviceCost: costQ.serviceCost, monthlyCost: costQ.monthlyCost },
      qOpts,
    );
    cost = {
      serviceBreakdown: costResults.serviceCost?.rows || [],
      monthlyTrend: costResults.monthlyCost?.rows || [],
    };
  }

  // ── Phase 3: Auto-collect collectors (parallel) ──
  send('status', { step: 'collectors', message: isEn
    ? 'Running specialized collectors (EKS, DB, MSK, Idle)...'
    : '전문 컬렉터 실행 중 (EKS, DB, MSK, 유휴 리소스)...' });

  const [eksM, dbM, mskM, idleM] = await Promise.all([
    import('@/lib/collectors/eks-optimize'),
    import('@/lib/collectors/db-optimize'),
    import('@/lib/collectors/msk-optimize'),
    import('@/lib/collectors/idle-scan'),
  ]);

  const [eksR, dbR, mskR, idleR] = await Promise.allSettled([
    eksM.default.collect(send, accountId, isEn),
    dbM.default.collect(send, accountId, isEn),
    mskM.default.collect(send, accountId, isEn),
    idleM.default.collect(send, accountId, isEn),
  ]);

  const eks = eksR.status === 'fulfilled' ? eksR.value : null;
  const database = dbR.status === 'fulfilled' ? dbR.value : null;
  const msk = mskR.status === 'fulfilled' ? mskR.value : null;
  const idle = idleR.status === 'fulfilled' ? idleR.value : null;

  // ── Phase 4: CIS benchmark (optional) ──
  send('status', { step: 'benchmark', message: isEn
    ? 'Fetching CIS compliance score...'
    : 'CIS 컴플라이언스 점수 조회 중...' });

  let complianceScore: any = null;
  try {
    const benchUrl = `${BASE_URL}/awsops/api/benchmark?action=result&accountId=${accountId || ''}`;
    const benchRes = await fetch(benchUrl, { signal: AbortSignal.timeout(10000) });
    if (benchRes.ok) complianceScore = await benchRes.json();
  } catch { /* benchmark unavailable — non-critical */ }

  const security = {
    publicS3: infraResults.publicS3?.rows || [],
    openSgs: infraResults.openSgs?.rows || [],
    unencryptedEbs: infraResults.unencryptedEbs?.rows || [],
    iamSummary: { users: iamUserCount, roles: iamRoleCount },
    complianceScore,
  };

  send('status', { step: 'done', message: isEn
    ? 'Data collection complete.'
    : '데이터 수집 완료.' });

  return {
    timestamp: new Date().toISOString(),
    accountId,
    accountAlias: account?.alias,
    cost,
    compute,
    eks,
    database,
    network,
    storage,
    security,
    idle,
    msk,
    rdsInstances,
    mskClusters,
  };
}

// ============================================================================
// Format helpers
// ============================================================================

function jsonBlock(label: string, data: any): string {
  if (!data || (Array.isArray(data) && data.length === 0)) return '';
  return `## ${label}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

function abbreviate(arr: any[], limit = 20): any[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, limit);
}

function summaryLine(label: string, count: number): string {
  return `- ${label}: ${count}`;
}

// ============================================================================
// Cost service category filters for split cost sections
// 비용 서비스 카테고리 필터 (분할 비용 섹션용)
// ============================================================================

const COMPUTE_SERVICES = ['Amazon Elastic Compute Cloud', 'AWS Lambda', 'Amazon Elastic Container Service', 'Amazon Elastic Kubernetes Service', 'Amazon EC2 Container Registry'];
const NETWORK_SERVICES = ['Amazon Virtual Private Cloud', 'Amazon CloudFront', 'AWS Data Transfer', 'Elastic Load Balancing', 'Amazon Route 53', 'AWS Transit Gateway'];
const STORAGE_SERVICES = ['Amazon Simple Storage Service', 'Amazon Elastic Block Store', 'Amazon Elastic File System', 'AWS Backup', 'Amazon S3 Glacier'];

function filterCostByServices(breakdown: any[], servicePatterns: string[]): any[] {
  if (!breakdown || breakdown.length === 0) return [];
  return breakdown.filter((item: any) => {
    const svc = (item.service || item.service_name || '').toLowerCase();
    return servicePatterns.some(p => svc.toLowerCase().includes(p.toLowerCase()));
  });
}

// ============================================================================
// Format report data for Bedrock context
// ============================================================================

export async function formatReportForBedrock(
  data: ReportData,
  section: string,
): Promise<string> {
  const parts: string[] = [];

  switch (section) {
    // ── Cost Overview (replaces old cost-analysis) ──
    case 'cost-overview':
    case 'cost-analysis': {
      if (!data.cost) return '\n\n--- Cost data unavailable ---';
      parts.push('# Cost Overview');
      parts.push(jsonBlock('Service Cost Breakdown (last 30 days)', data.cost.serviceBreakdown));
      parts.push(jsonBlock('Monthly Cost Trend', abbreviate(data.cost.monthlyTrend, 50)));
      break;
    }

    // ── Cost: Compute ──
    case 'cost-compute': {
      parts.push('# Cost Analysis: Compute');
      if (data.cost) {
        const filtered = filterCostByServices(data.cost.serviceBreakdown, COMPUTE_SERVICES);
        parts.push(jsonBlock('Compute Service Costs', filtered));
      }
      if (data.compute) {
        parts.push(jsonBlock('EC2 Instances', data.compute.ec2Instances));
        parts.push(jsonBlock('Lambda Functions (top 20)', abbreviate(data.compute.lambdaFunctions)));
        parts.push(jsonBlock('ECS Clusters', data.compute.ecsClusters));
      }
      if (parts.length <= 1) return '\n\n--- Compute cost data unavailable ---';
      break;
    }

    // ── Cost: Network ──
    case 'cost-network': {
      parts.push('# Cost Analysis: Network & Data Transfer');
      if (data.cost) {
        const filtered = filterCostByServices(data.cost.serviceBreakdown, NETWORK_SERVICES);
        parts.push(jsonBlock('Network Service Costs', filtered));
      }
      if (data.network) {
        parts.push(jsonBlock('VPCs', data.network.vpcs));
        parts.push(jsonBlock('NAT Gateways', data.network.natGateways));
        parts.push(jsonBlock('Subnets (top 50)', abbreviate(data.network.subnets, 50)));
      }
      if (parts.length <= 1) return '\n\n--- Network cost data unavailable ---';
      break;
    }

    // ── Cost: Storage ──
    case 'cost-storage': {
      parts.push('# Cost Analysis: Storage');
      if (data.cost) {
        const filtered = filterCostByServices(data.cost.serviceBreakdown, STORAGE_SERVICES);
        parts.push(jsonBlock('Storage Service Costs', filtered));
      }
      if (data.storage) {
        parts.push(jsonBlock('S3 Buckets', data.storage.s3Buckets));
        parts.push(jsonBlock('EBS Volumes (top 50)', abbreviate(data.storage.ebsVolumes, 50)));
        parts.push(jsonBlock('EBS Summary by Type', data.storage.ebsSummary));
      }
      if (parts.length <= 1) return '\n\n--- Storage cost data unavailable ---';
      break;
    }

    // ── Compute Analysis (standalone) ──
    case 'compute':
    case 'compute-analysis': {
      if (!data.compute) return '\n\n--- Compute data unavailable ---';
      parts.push('# Compute Resources');
      parts.push(jsonBlock('EC2 Instances', data.compute.ec2Instances));
      parts.push(jsonBlock('Lambda Functions', abbreviate(data.compute.lambdaFunctions)));
      parts.push(jsonBlock('ECS Clusters', data.compute.ecsClusters));
      break;
    }

    // ── EKS Analysis (delegate to collector) ──
    case 'eks':
    case 'eks-analysis': {
      if (!data.eks) return '\n\n--- EKS data unavailable ---';
      const { default: eksC } = await import('@/lib/collectors/eks-optimize');
      parts.push('# EKS Optimization Data');
      parts.push(eksC.formatContext(data.eks));
      break;
    }

    // ── Database Analysis (delegate to collector + RDS instances) ──
    case 'database':
    case 'database-analysis': {
      parts.push('# Database Analysis');
      if (data.database) {
        const { default: dbC } = await import('@/lib/collectors/db-optimize');
        parts.push(dbC.formatContext(data.database));
      }
      if (data.rdsInstances && data.rdsInstances.length > 0) {
        parts.push(jsonBlock('RDS Instances', data.rdsInstances));
      }
      if (!data.database && data.rdsInstances.length === 0) {
        return '\n\n--- Database data unavailable ---';
      }
      break;
    }

    // ── MSK Analysis (delegate to collector + MSK clusters) ──
    case 'msk':
    case 'msk-analysis': {
      parts.push('# MSK Analysis');
      if (data.msk) {
        const { default: mskC } = await import('@/lib/collectors/msk-optimize');
        parts.push(mskC.formatContext(data.msk));
      }
      if (data.mskClusters && data.mskClusters.length > 0) {
        parts.push(jsonBlock('MSK Clusters', data.mskClusters));
      }
      if (!data.msk && (!data.mskClusters || data.mskClusters.length === 0)) {
        return '\n\n--- MSK data unavailable ---';
      }
      break;
    }

    // ── Idle resources (delegate to collector) ──
    case 'idle':
    case 'idle-resources': {
      if (!data.idle) return '\n\n--- Idle resource data unavailable ---';
      const { default: idleC } = await import('@/lib/collectors/idle-scan');
      parts.push('# Idle Resource Scan');
      parts.push(idleC.formatContext(data.idle));
      break;
    }

    // ── Network Architecture ──
    case 'network':
    case 'network-architecture': {
      if (!data.network) return '\n\n--- Network data unavailable ---';
      parts.push('# Network Architecture');
      parts.push(jsonBlock('VPCs', data.network.vpcs));
      parts.push(jsonBlock('Subnets', abbreviate(data.network.subnets, 50)));
      parts.push(jsonBlock('NAT Gateways', data.network.natGateways));
      parts.push(jsonBlock('Load Balancers', data.network.loadBalancers));
      parts.push(jsonBlock('Route Tables', abbreviate(data.network.routeTables, 30)));
      parts.push(jsonBlock('VPC Peering Connections', data.network.vpcPeerings));
      parts.push(jsonBlock('Transit Gateways', data.network.transitGateways));
      break;
    }

    // ── Storage Analysis ──
    case 'storage':
    case 'storage-analysis': {
      if (!data.storage) return '\n\n--- Storage data unavailable ---';
      parts.push('# Storage Resources');
      parts.push(jsonBlock('S3 Buckets', data.storage.s3Buckets));
      parts.push(jsonBlock('EBS Volumes', abbreviate(data.storage.ebsVolumes, 50)));
      parts.push(jsonBlock('EBS Summary by Type', data.storage.ebsSummary));
      break;
    }

    // ── Security Posture ──
    case 'security':
    case 'security-posture': {
      if (!data.security) return '\n\n--- Security data unavailable ---';
      parts.push('# Security Posture');
      parts.push(jsonBlock('Public S3 Buckets', data.security.publicS3));
      parts.push(jsonBlock('Open Security Groups (0.0.0.0/0 ingress)', data.security.openSgs));
      parts.push(jsonBlock('Unencrypted EBS Volumes', data.security.unencryptedEbs));
      parts.push(jsonBlock('IAM Summary', data.security.iamSummary));
      if (data.security.complianceScore) {
        parts.push(jsonBlock('CIS Compliance Score', data.security.complianceScore));
      }
      break;
    }

    // ── Executive Summary / Recommendations — abbreviated ALL data ──
    case 'executive-summary':
    case 'recommendations': {
      parts.push(`# ${section === 'executive-summary' ? 'Executive Summary' : 'Recommendations'} Context`);
      parts.push(`Report generated: ${data.timestamp}`);
      if (data.accountAlias) parts.push(`Account: ${data.accountAlias} (${data.accountId})`);

      // Resource counts
      parts.push('\n## Resource Counts');
      if (data.compute) {
        parts.push(summaryLine('EC2 Instances', data.compute.ec2Instances.length));
        parts.push(summaryLine('Lambda Functions', data.compute.lambdaFunctions.length));
        parts.push(summaryLine('ECS Clusters', data.compute.ecsClusters.length));
      }
      if (data.network) {
        parts.push(summaryLine('VPCs', data.network.vpcs.length));
        parts.push(summaryLine('Subnets', data.network.subnets.length));
        parts.push(summaryLine('NAT Gateways', data.network.natGateways.length));
        parts.push(summaryLine('Load Balancers', data.network.loadBalancers.length));
        parts.push(summaryLine('Route Tables', data.network.routeTables.length));
        parts.push(summaryLine('VPC Peerings', data.network.vpcPeerings.length));
        parts.push(summaryLine('Transit Gateways', data.network.transitGateways.length));
      }
      if (data.storage) {
        parts.push(summaryLine('S3 Buckets', data.storage.s3Buckets.length));
        parts.push(summaryLine('EBS Volumes', data.storage.ebsVolumes.length));
      }
      if (data.rdsInstances.length > 0) {
        parts.push(summaryLine('RDS Instances', data.rdsInstances.length));
      }
      if (data.mskClusters.length > 0) {
        parts.push(summaryLine('MSK Clusters', data.mskClusters.length));
      }

      // Cost top 10
      if (data.cost && data.cost.serviceBreakdown.length > 0) {
        parts.push(jsonBlock('Top 10 Services by Cost', abbreviate(data.cost.serviceBreakdown, 10)));
      }

      // Security issues
      if (data.security) {
        parts.push('\n## Security Issues');
        parts.push(summaryLine('Public S3 Buckets', data.security.publicS3.length));
        parts.push(summaryLine('Open Security Groups', data.security.openSgs.length));
        parts.push(summaryLine('Unencrypted EBS Volumes', data.security.unencryptedEbs.length));
        if (data.security.complianceScore) {
          parts.push(jsonBlock('CIS Compliance', data.security.complianceScore));
        }
      }

      // Collector summaries
      if (data.idle) {
        parts.push('\n## Idle Resources');
        parts.push(`Tools used: ${data.idle.usedTools.join(', ')}`);
        parts.push(`Queried: ${data.idle.queriedResources.join(', ')}`);
        for (const [key, val] of Object.entries(data.idle.sections)) {
          if (Array.isArray(val)) parts.push(summaryLine(key, val.length));
        }
      }
      if (data.eks) {
        parts.push(`\n## EKS: ${data.eks.viaSummary}`);
      }
      if (data.database) {
        parts.push(`\n## Database: ${data.database.viaSummary}`);
      }
      if (data.msk) {
        parts.push(`\n## MSK: ${data.msk.viaSummary}`);
      }
      break;
    }

    // ── Appendix — ALL inventory counts as summary tables ──
    case 'appendix': {
      parts.push('# Appendix: Resource Inventory Summary');
      parts.push(`Report generated: ${data.timestamp}`);
      if (data.accountAlias) parts.push(`Account: ${data.accountAlias} (${data.accountId})`);

      parts.push('\n## Inventory Counts');
      const counts: Array<{ category: string; resource: string; count: number }> = [];

      if (data.compute) {
        counts.push({ category: 'Compute', resource: 'EC2 Instances', count: data.compute.ec2Instances.length });
        counts.push({ category: 'Compute', resource: 'Lambda Functions', count: data.compute.lambdaFunctions.length });
        counts.push({ category: 'Compute', resource: 'ECS Clusters', count: data.compute.ecsClusters.length });
      }
      if (data.network) {
        counts.push({ category: 'Network', resource: 'VPCs', count: data.network.vpcs.length });
        counts.push({ category: 'Network', resource: 'Subnets', count: data.network.subnets.length });
        counts.push({ category: 'Network', resource: 'NAT Gateways', count: data.network.natGateways.length });
        counts.push({ category: 'Network', resource: 'Load Balancers', count: data.network.loadBalancers.length });
        counts.push({ category: 'Network', resource: 'Route Tables', count: data.network.routeTables.length });
        counts.push({ category: 'Network', resource: 'VPC Peerings', count: data.network.vpcPeerings.length });
        counts.push({ category: 'Network', resource: 'Transit Gateways', count: data.network.transitGateways.length });
      }
      if (data.storage) {
        counts.push({ category: 'Storage', resource: 'S3 Buckets', count: data.storage.s3Buckets.length });
        counts.push({ category: 'Storage', resource: 'EBS Volumes', count: data.storage.ebsVolumes.length });
      }
      counts.push({ category: 'Database', resource: 'RDS Instances', count: data.rdsInstances.length });
      counts.push({ category: 'Streaming', resource: 'MSK Clusters', count: data.mskClusters.length });

      if (data.security) {
        counts.push({ category: 'Security', resource: 'Public S3 Buckets', count: data.security.publicS3.length });
        counts.push({ category: 'Security', resource: 'Open Security Groups', count: data.security.openSgs.length });
        counts.push({ category: 'Security', resource: 'Unencrypted EBS Volumes', count: data.security.unencryptedEbs.length });
        counts.push({ category: 'Security', resource: 'IAM Users', count: data.security.iamSummary.users });
        counts.push({ category: 'Security', resource: 'IAM Roles', count: data.security.iamSummary.roles });
      }

      // Format as markdown table
      parts.push('| Category | Resource | Count |');
      parts.push('|----------|----------|------:|');
      for (const row of counts) {
        parts.push(`| ${row.category} | ${row.resource} | ${row.count} |`);
      }

      // EBS volume type breakdown
      if (data.storage && data.storage.ebsSummary.length > 0) {
        parts.push('\n## EBS Volume Type Breakdown');
        parts.push('| Volume Type | Count | Total GB |');
        parts.push('|-------------|------:|---------:|');
        for (const row of data.storage.ebsSummary) {
          parts.push(`| ${row.volume_type} | ${row.count} | ${row.total_gb} |`);
        }
      }

      // Collector summaries
      if (data.idle) {
        parts.push(`\n## Idle Resources Summary`);
        for (const [key, val] of Object.entries(data.idle.sections)) {
          if (Array.isArray(val)) parts.push(summaryLine(key, val.length));
        }
      }
      if (data.eks) parts.push(`\n## EKS: ${data.eks.viaSummary}`);
      if (data.database) parts.push(`\n## Database: ${data.database.viaSummary}`);
      if (data.msk) parts.push(`\n## MSK: ${data.msk.viaSummary}`);

      break;
    }

    // ── All sections concatenated (legacy) ──
    case 'all': {
      const allSections = [
        'executive-summary', 'cost-overview', 'cost-compute', 'cost-network', 'cost-storage',
        'compute-analysis', 'network-architecture', 'storage-analysis',
        'security-posture', 'eks-analysis', 'database-analysis', 'msk-analysis', 'idle-resources',
      ];
      for (const s of allSections) {
        const formatted = await formatReportForBedrock(data, s);
        if (formatted) parts.push(formatted);
      }
      break;
    }

    default:
      return `\n\n--- Unknown report section: ${section} ---`;
  }

  return parts.filter(Boolean).join('\n\n');
}
