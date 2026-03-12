'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import {
  Server, Database, DollarSign, Box, Shield, Network,
  Bell, Container, ShieldCheck, AlertTriangle, Zap, Table,
  Activity, FileSearch,
} from 'lucide-react';
import { queries as ec2Q } from '@/lib/queries/ec2';
import { queries as s3Q } from '@/lib/queries/s3';
import { queries as rdsQ } from '@/lib/queries/rds';
import { queries as lambdaQ } from '@/lib/queries/lambda';
import { queries as vpcQ } from '@/lib/queries/vpc';
import { queries as iamQ } from '@/lib/queries/iam';
import { queries as cwQ } from '@/lib/queries/cloudwatch';
import { queries as ecsQ } from '@/lib/queries/ecs';
import { queries as dynamoQ } from '@/lib/queries/dynamodb';
import { queries as costQ } from '@/lib/queries/cost';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { queries as secQ } from '@/lib/queries/security';

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

// Clickable card wrapper / 클릭 가능한 카드 래퍼
function CardLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <div onClick={() => router.push(href)}
      className={`cursor-pointer transition-all hover:scale-[1.02] hover:border-accent-cyan/30 ${className}`}>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const url = bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            ec2Status: ec2Q.statusCount,
            ec2Types: ec2Q.typeDistribution,
            s3Summary: s3Q.summary,
            rdsSummary: rdsQ.summary,
            lambdaSummary: lambdaQ.summary,
            vpcSummary: vpcQ.summary,
            iamSummary: iamQ.summary,
            cwSummary: cwQ.summary,
            ecsSummary: ecsQ.summary,
            dynamoSummary: dynamoQ.summary,
            costSummary: costQ.summary,
            k8sNodes: k8sQ.nodeSummary,
            k8sPods: k8sQ.podSummary,
            k8sDeploy: k8sQ.deploymentSummary,
            secSummary: secQ.summary,
            k8sWarnings: k8sQ.warningEvents,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const ec2States = get('ec2Status');
  const running = ec2States.find((r: any) => r.name === 'running');
  const totalEC2 = ec2States.reduce((sum: number, r: any) => sum + (Number(r.value) || 0), 0);
  const s3 = getFirst('s3Summary') as any;
  const rds = getFirst('rdsSummary') as any;
  const lambda = getFirst('lambdaSummary') as any;
  const vpc = getFirst('vpcSummary') as any;
  const iam = getFirst('iamSummary') as any;
  const cw = getFirst('cwSummary') as any;
  const ecs = getFirst('ecsSummary') as any;
  const dynamo = getFirst('dynamoSummary') as any;
  const cost = getFirst('costSummary') as any;
  const k8sNodes = getFirst('k8sNodes') as any;
  const k8sDeploy = getFirst('k8sDeploy') as any;
  const sec = getFirst('secSummary') as any;
  const podSum = getFirst('k8sPods') as any;
  const totalPods = Number(podSum?.total_pods) || 0;

  // Security issues / 보안 이슈 합산
  const pubBuckets = Number(sec?.public_buckets) || 0;
  const openSgs = Number(sec?.open_sgs) || 0;
  const unencVols = Number(sec?.unencrypted_volumes) || 0;
  const totalIssues = pubBuckets + openSgs + unencVols;
  const secDetails = [
    pubBuckets > 0 ? `${pubBuckets} Public S3` : '',
    openSgs > 0 ? `${openSgs} Open SG` : '',
    unencVols > 0 ? `${unencVols} Unencrypted EBS` : '',
  ].filter(Boolean).join(', ');

  // Warnings / 경고
  const warnings: { icon: React.ElementType; text: string; severity: string; href: string }[] = [];
  if (pubBuckets > 0) warnings.push({ icon: Database, text: `${pubBuckets} Public S3 Buckets`, severity: 'error', href: '/s3' });
  if (Number(iam?.mfa_not_enabled) > 0) warnings.push({ icon: Shield, text: `${iam.mfa_not_enabled} IAM users without MFA`, severity: 'warning', href: '/iam' });
  if (Number(cw?.alarm_count) > 0) warnings.push({ icon: Bell, text: `${cw.alarm_count} CloudWatch Alarms`, severity: 'error', href: '/cloudwatch' });
  if (openSgs > 0) warnings.push({ icon: ShieldCheck, text: `${openSgs} Open Security Groups`, severity: 'warning', href: '/security' });
  const k8sWarnings = get('k8sWarnings');
  if (k8sWarnings.length > 0) warnings.push({ icon: Box, text: `K8s: ${k8sWarnings.length} Warning events`, severity: 'warning', href: '/k8s' });

  // Resource bar chart data / 리소스 바 차트 데이터
  const resourceCounts = [
    { name: 'EC2', value: totalEC2 },
    { name: 'Lambda', value: Number(lambda?.total_functions) || 0 },
    { name: 'S3', value: Number(s3?.total_buckets) || 0 },
    { name: 'RDS', value: Number(rds?.total_instances) || 0 },
    { name: 'ECS Tasks', value: Number(ecs?.total_tasks) || 0 },
    { name: 'DynamoDB', value: Number(dynamo?.total_tables) || 0 },
    { name: 'K8s Pods', value: totalPods },
  ].filter(r => r.value > 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="AWSops Dashboard" subtitle="AWS + Kubernetes Resource Overview" onRefresh={() => fetchData(true)} />

      {/* Row 1: Compute + Containers (사이드바: Compute + Kubernetes) */}
      <div>
        <h2 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Compute & Containers</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <CardLink href="/ec2">
            <StatsCard label="EC2" value={totalEC2} icon={Server} color="cyan"
              change={running ? `${running.value} running` : undefined} />
          </CardLink>
          <CardLink href="/lambda">
            <StatsCard label="Lambda" value={Number(lambda?.total_functions) || 0} icon={Zap} color="purple"
              change={`${Number(lambda?.unique_runtimes) || 0} runtimes`} />
          </CardLink>
          <CardLink href="/ecs">
            <StatsCard label="ECS" value={Number(ecs?.total_tasks) || 0} icon={Container} color="orange"
              change={`${Number(ecs?.total_clusters) || 0} clusters`} />
          </CardLink>
          <CardLink href="/k8s">
            <StatsCard label="K8s Nodes" value={Number(k8sNodes?.total_nodes) || 0} icon={Box} color="pink"
              change={`${Number(k8sNodes?.ready_nodes) || 0} ready`} />
          </CardLink>
          <CardLink href="/k8s">
            <StatsCard label="K8s Pods" value={totalPods} icon={Box} color="green"
              change={`${Number(podSum?.running_pods) || 0} running`} />
          </CardLink>
          <CardLink href="/k8s">
            <StatsCard label="Deployments" value={Number(k8sDeploy?.total_deployments) || 0} icon={Box} color="cyan"
              change={`${Number(k8sDeploy?.fully_available) || 0} available`} />
          </CardLink>
        </div>
      </div>

      {/* Row 2: Network + Database + Storage (사이드바: Network + Database) */}
      <div>
        <h2 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Network & Data</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <CardLink href="/vpc">
            <StatsCard label="VPCs" value={Number(vpc?.vpc_count) || 0} icon={Network} color="orange"
              change={`${vpc?.subnet_count || 0} Subnets`} />
          </CardLink>
          <CardLink href="/vpc">
            <StatsCard label="Security Groups" value={Number(vpc?.sg_count) || 0} icon={Shield} color="cyan" />
          </CardLink>
          <CardLink href="/rds">
            <StatsCard label="RDS" value={Number(rds?.total_instances) || 0} icon={Database} color="green"
              change={`${Number(rds?.total_storage_gb) || 0} GB`} />
          </CardLink>
          <CardLink href="/dynamodb">
            <StatsCard label="DynamoDB" value={Number(dynamo?.total_tables) || 0} icon={Table} color="purple" />
          </CardLink>
          <CardLink href="/elasticache">
            <StatsCard label="ElastiCache" value={Number(dynamo?.total_tables) !== undefined ? '--' : '--'} icon={Database} color="orange" />
          </CardLink>
          <CardLink href="/s3">
            <StatsCard label="S3 Buckets" value={Number(s3?.total_buckets) || 0} icon={Database} color="green"
              change={pubBuckets > 0 ? `${pubBuckets} public!` : undefined} />
          </CardLink>
        </div>
      </div>

      {/* Row 3: Security + Monitoring + Cost (사이드바: Security & Cost + Monitoring) */}
      <div>
        <h2 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Security, Monitoring & Cost</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <CardLink href="/security" className={totalIssues > 0 ? 'ring-1 ring-accent-red/30 rounded-lg' : ''}>
            <StatsCard label="Security Issues" value={totalIssues} icon={ShieldCheck}
              color={totalIssues > 0 ? 'red' : 'green'} highlight
              change={totalIssues > 0 ? secDetails : '✓ All clear'} />
          </CardLink>
          <CardLink href="/iam">
            <StatsCard label="IAM Users" value={Number(iam?.total_users) || 0} icon={Shield} color="purple"
              change={Number(iam?.mfa_not_enabled) > 0 ? `${iam.mfa_not_enabled} no MFA` : undefined} />
          </CardLink>
          <CardLink href="/cloudwatch">
            <StatsCard label="CW Alarms" value={Number(cw?.alarm_count) || 0} icon={Bell}
              color={Number(cw?.alarm_count) > 0 ? 'red' : 'green'}
              change={Number(cw?.alarm_count) > 0 ? 'Active alarms' : '✓ No alarms'} />
          </CardLink>
          <CardLink href="/cloudtrail">
            <StatsCard label="CloudTrail" value="Active" icon={FileSearch} color="cyan"
              change="API audit logs" />
          </CardLink>
          <CardLink href="/compliance">
            <StatsCard label="CIS Compliance" value="Scan" icon={ShieldCheck} color="purple"
              change="Run benchmark" />
          </CardLink>
          <CardLink href="/cost">
            <StatsCard label="Monthly Cost" value={cost?.total_cost ? `$${Number(cost.total_cost).toLocaleString()}` : '$--'}
              icon={DollarSign} color="orange" />
          </CardLink>
        </div>
      </div>

      {/* Warnings / 경고 */}
      {warnings.length > 0 && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
          <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">
            <AlertTriangle size={12} className="inline mr-1 text-accent-orange" />
            Active Warnings ({warnings.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {warnings.map((w, i) => (
              <div key={i} onClick={() => router.push(w.href)}
                className="flex items-center gap-3 p-2.5 rounded bg-navy-900 cursor-pointer hover:bg-navy-700 transition-colors">
                <w.icon size={16} className={w.severity === 'error' ? 'text-accent-red' : 'text-accent-orange'} />
                <span className="text-sm">{w.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts / 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChartCard title="Resource Distribution" data={resourceCounts} />
        <PieChartCard title="EC2 Instance Types" data={get('ec2Types').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 })).slice(0, 8)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="K8s Pod Status" data={[
          { name: 'Running', value: Number(podSum?.running_pods) || 0 },
          { name: 'Pending', value: Number(podSum?.pending_pods) || 0 },
          { name: 'Failed', value: Number(podSum?.failed_pods) || 0 },
          { name: 'Succeeded', value: Number(podSum?.succeeded_pods) || 0 },
        ].filter(d => d.value > 0)} />
        {/* K8s Warning Events / K8s 경고 이벤트 */}
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-orange" />
            Recent K8s Events
          </h3>
          {k8sWarnings.length === 0 && !loading ? (
            <p className="text-gray-500 text-sm">No warning events</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {k8sWarnings.slice(0, 8).map((ev: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-navy-900 text-xs">
                  <AlertTriangle size={11} className="text-accent-orange mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-gray-400">{String(ev.namespace)}/{String(ev.name)}</span>
                    <span className="text-gray-600 ml-2">{String(ev.reason)}</span>
                    <p className="text-gray-300 mt-0.5">{String(ev.message).slice(0, 100)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
