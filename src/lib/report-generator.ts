// Report data collector — gathers Steampipe data for AI diagnosis report
// 리포트 데이터 수집기 — AI 종합 진단 리포트용 Steampipe 데이터 수집
import { batchQuery, checkCostAvailability } from '@/lib/steampipe';
import { queries as ec2Q } from '@/lib/queries/ec2';
import { queries as s3Q } from '@/lib/queries/s3';
import { queries as rdsQ } from '@/lib/queries/rds';
import { queries as vpcQ } from '@/lib/queries/vpc';
import { queries as iamQ } from '@/lib/queries/iam';
import { queries as ecsQ } from '@/lib/queries/ecs';
import { queries as lambdaQ } from '@/lib/queries/lambda';
import { queries as costQ } from '@/lib/queries/cost';
import { queries as secQ } from '@/lib/queries/security';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { queries as ebsQ } from '@/lib/queries/ebs';
import { queries as mskQ } from '@/lib/queries/msk';
import { queries as osQ } from '@/lib/queries/opensearch';
import { queries as ecacheQ } from '@/lib/queries/elasticache';
import { queries as dynamoQ } from '@/lib/queries/dynamodb';

// --- Types ---

export interface ReportData {
  ec2: any;
  s3: any;
  rds: any;
  vpc: any;
  iam: any;
  ecs: any;
  lambda: any;
  cost: any;
  security: any;
  k8s: any;
  ebs: any;
  msk: any;
  opensearch: any;
  elasticache: any;
  dynamodb: any;
  costAvailable: boolean;
  accountId?: string;
}

type LiveSendFn = (event: string, data: any) => void;

// --- Data collection ---

export async function collectReportData(
  accountId?: string,
  liveSend?: LiveSendFn,
  isEn?: boolean,
): Promise<ReportData> {
  const opts = accountId ? { accountId } : undefined;
  const send = liveSend || (() => {});

  send('status', { message: isEn ? 'Checking Cost Explorer availability...' : 'Cost Explorer 가용성 확인 중...' });
  const costResult = await checkCostAvailability(false, accountId);
  const costAvailable = costResult.available;

  send('status', { message: isEn ? 'Collecting compute resources...' : '컴퓨팅 리소스 수집 중...' });
  const computeData = await batchQuery({
    ec2Status: ec2Q.statusCount,
    ec2Types: ec2Q.typeDistribution,
    lambdaSummary: lambdaQ.summary,
    ecsSummary: ecsQ.summary,
  }, opts);

  send('status', { message: isEn ? 'Collecting network resources...' : '네트워크 리소스 수집 중...' });
  const networkData = await batchQuery({
    vpcSummary: vpcQ.summary,
  }, opts);

  send('status', { message: isEn ? 'Collecting storage & database resources...' : '스토리지/DB 리소스 수집 중...' });
  const storageData = await batchQuery({
    s3Summary: s3Q.summary,
    rdsSummary: rdsQ.summary,
    ebsSummary: ebsQ.summary,
    dynamoSummary: dynamoQ.summary,
    ecacheSummary: ecacheQ.summary,
    mskSummary: mskQ.summary,
    osSummary: osQ.summary,
  }, opts);

  send('status', { message: isEn ? 'Collecting security data...' : '보안 데이터 수집 중...' });
  const securityData = await batchQuery({
    secSummary: secQ.summary,
    iamSummary: iamQ.summary,
  }, opts);

  send('status', { message: isEn ? 'Collecting Kubernetes data...' : 'Kubernetes 데이터 수집 중...' });
  const k8sData = await batchQuery({
    k8sNodes: k8sQ.nodeSummary,
    k8sPods: k8sQ.podSummary,
    k8sDeploy: k8sQ.deploymentSummary,
  }, opts);

  let costData: any = {};
  if (costAvailable) {
    send('status', { message: isEn ? 'Collecting cost data...' : '비용 데이터 수집 중...' });
    costData = await batchQuery({
      costSummary: costQ.summary,
      costDetail: costQ.dashboardDetail,
    }, opts);
  }

  return {
    ec2: computeData,
    s3: storageData,
    rds: storageData,
    vpc: networkData,
    iam: securityData,
    ecs: computeData,
    lambda: computeData,
    cost: costData,
    security: securityData,
    k8s: k8sData,
    ebs: storageData,
    msk: storageData,
    opensearch: storageData,
    elasticache: storageData,
    dynamodb: storageData,
    costAvailable,
    accountId,
  };
}

// --- Format data for Bedrock context ---

function formatRows(data: any, key: string): string {
  const rows = data?.[key]?.rows;
  if (!rows || rows.length === 0) return 'No data available.';
  return JSON.stringify(rows, null, 2).slice(0, 8000);
}

export async function formatReportForBedrock(
  data: ReportData,
  section: string,
): Promise<string> {
  switch (section) {
    case 'cost-overview':
    case 'cost-compute':
    case 'cost-network':
    case 'cost-storage':
      if (!data.costAvailable) return 'Cost Explorer is not available for this account.';
      return `# Cost Data\n${formatRows(data.cost, 'costSummary')}\n\n# Cost Detail\n${formatRows(data.cost, 'costDetail')}`;

    case 'idle-resources':
      return `# EC2 Status\n${formatRows(data.ec2, 'ec2Status')}\n\n# EBS Summary\n${formatRows(data.ebs, 'ebsSummary')}`;

    case 'security-posture':
      return `# Security Summary\n${formatRows(data.security, 'secSummary')}\n\n# IAM Summary\n${formatRows(data.iam, 'iamSummary')}`;

    case 'network-architecture':
      return `# VPC Summary\n${formatRows(data.vpc, 'vpcSummary')}`;

    case 'compute-analysis':
      return `# EC2 Status\n${formatRows(data.ec2, 'ec2Status')}\n\n# EC2 Types\n${formatRows(data.ec2, 'ec2Types')}\n\n# Lambda\n${formatRows(data.lambda, 'lambdaSummary')}\n\n# ECS\n${formatRows(data.ecs, 'ecsSummary')}`;

    case 'eks-analysis':
      return `# K8s Nodes\n${formatRows(data.k8s, 'k8sNodes')}\n\n# K8s Pods\n${formatRows(data.k8s, 'k8sPods')}\n\n# Deployments\n${formatRows(data.k8s, 'k8sDeploy')}`;

    case 'database-analysis':
      return `# RDS Summary\n${formatRows(data.rds, 'rdsSummary')}\n\n# DynamoDB\n${formatRows(data.dynamodb, 'dynamoSummary')}\n\n# ElastiCache\n${formatRows(data.elasticache, 'ecacheSummary')}`;

    case 'msk-analysis':
      return `# MSK Summary\n${formatRows(data.msk, 'mskSummary')}`;

    case 'storage-analysis':
      return `# S3 Summary\n${formatRows(data.s3, 's3Summary')}\n\n# EBS Summary\n${formatRows(data.ebs, 'ebsSummary')}\n\n# OpenSearch\n${formatRows(data.opensearch, 'osSummary')}`;

    case 'executive-summary':
    case 'recommendations':
      return `# EC2\n${formatRows(data.ec2, 'ec2Status')}\n\n# Security\n${formatRows(data.security, 'secSummary')}\n\n# Cost\n${data.costAvailable ? formatRows(data.cost, 'costSummary') : 'N/A'}`;

    case 'appendix':
      return `# Resource Inventory\n- EC2: ${formatRows(data.ec2, 'ec2Status')}\n- S3: ${formatRows(data.s3, 's3Summary')}\n- RDS: ${formatRows(data.rds, 'rdsSummary')}\n- EBS: ${formatRows(data.ebs, 'ebsSummary')}`;

    default:
      return 'No data available for this section.';
  }
}
