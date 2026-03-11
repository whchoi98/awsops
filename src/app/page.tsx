'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import LiveResourceCard from '@/components/dashboard/LiveResourceCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import { useRouter } from 'next/navigation';
import {
  Server, Database, DollarSign, Box, Shield, Network,
  Bell, Container, ShieldCheck, AlertTriangle,
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

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
            rdsEngines: rdsQ.engineDistribution,
            lambdaSummary: lambdaQ.summary,
            vpcSummary: vpcQ.summary,
            iamSummary: iamQ.summary,
            cwSummary: cwQ.summary,
            ecsSummary: ecsQ.summary,
            dynamoSummary: dynamoQ.summary,
            costMonthly: costQ.monthlyCost,
            k8sNodes: k8sQ.nodeSummary,
            k8sPods: k8sQ.podSummary,
            k8sDeploy: k8sQ.deploymentSummary,
            secSummary: secQ.summary,
            cwAlarms: cwQ.alarmList,
            k8sWarnings: k8sQ.warningEvents,
          },
        }),
      });
      const result = await res.json();
      setData(result);
      setLastUpdated(new Date());
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const ec2States = get('ec2Status');
  const running = ec2States.find((r: Record<string, unknown>) => r.name === 'running');
  const totalEC2 = ec2States.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.value) || 0), 0);

  const s3 = getFirst('s3Summary') as Record<string, unknown>;
  const rds = getFirst('rdsSummary') as Record<string, unknown>;
  const lambda = getFirst('lambdaSummary') as Record<string, unknown>;
  const vpc = getFirst('vpcSummary') as Record<string, unknown>;
  const iam = getFirst('iamSummary') as Record<string, unknown>;
  const cw = getFirst('cwSummary') as Record<string, unknown>;
  const ecs = getFirst('ecsSummary') as Record<string, unknown>;
  const dynamo = getFirst('dynamoSummary') as Record<string, unknown>;
  const cost = getFirst('costMonthly') as Record<string, unknown>;
  const k8sNodes = getFirst('k8sNodes') as Record<string, unknown>;
  const k8sDeploy = getFirst('k8sDeploy') as Record<string, unknown>;
  const sec = getFirst('secSummary') as Record<string, unknown>;

  // podSummary returns a single row: {total_pods, running_pods, pending_pods, failed_pods, succeeded_pods}
  const podSum = getFirst('k8sPods') as Record<string, unknown>;
  const totalPods = Number(podSum?.total_pods) || 0;
  const runningPodsCount = Number(podSum?.running_pods) || 0;

  const warnings: { icon: React.ElementType; text: string; severity: string }[] = [];
  if (Number(s3?.public_buckets) > 0)
    warnings.push({ icon: Database, text: `${s3.public_buckets} Public S3 Buckets`, severity: 'error' });
  if (Number(iam?.mfa_not_enabled) > 0)
    warnings.push({ icon: Shield, text: `${iam.mfa_not_enabled} IAM users without MFA`, severity: 'warning' });
  if (Number(cw?.alarm_count) > 0)
    warnings.push({ icon: Bell, text: `${cw.alarm_count} CloudWatch Alarms firing`, severity: 'error' });
  if (Number(sec?.open_sgs) > 0)
    warnings.push({ icon: ShieldCheck, text: `${sec.open_sgs} Security Groups with open ingress`, severity: 'warning' });
  const k8sWarnings = get('k8sWarnings');
  if (k8sWarnings.length > 0)
    warnings.push({ icon: Box, text: `K8s: ${k8sWarnings.length} Warning events`, severity: 'warning' });

  const resourceCounts = [
    { name: 'EC2', value: totalEC2 },
    { name: 'S3', value: Number(s3?.total_buckets) || 0 },
    { name: 'RDS', value: Number(rds?.total_instances) || 0 },
    { name: 'Lambda', value: Number(lambda?.total_functions) || 0 },
    { name: 'ECS Tasks', value: Number(ecs?.total_tasks) || 0 },
    { name: 'DynamoDB', value: Number(dynamo?.total_tables) || 0 },
  ].filter(r => r.value > 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header
        title="AWSops Dashboard"
        subtitle="AWS + Kubernetes Resource Overview"
        onRefresh={() => fetchData(true)}
      />

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="EC2 Instances" value={totalEC2} icon={Server} color="cyan"
          change={running ? `${running.value} running` : undefined} />
        <StatsCard label="S3 Buckets" value={Number(s3?.total_buckets) || 0} icon={Database} color="green"
          change={Number(s3?.public_buckets) > 0 ? `${s3.public_buckets} public!` : undefined} />
        <StatsCard label="Monthly Cost" value={cost?.total_cost ? `$${Number(cost.total_cost).toLocaleString()}` : '$--'} icon={DollarSign} color="purple" />
        <StatsCard label="Network" value={`${Number(vpc?.vpc_count) || 0} VPCs`} icon={Network} color="orange"
          change={`${vpc?.subnet_count || 0} Subnets, ${vpc?.sg_count || 0} SGs`} />
        {/* Security Issues: clickable → /security, hover tooltip, alert color / 보안 이슈: 클릭 → /security, 호버 툴팁, 경고 색상 */}
        {(() => {
          const pubBuckets = Number(sec?.public_buckets) || 0;
          const openSgs = Number(sec?.open_sgs) || 0;
          const unencVols = Number(sec?.unencrypted_volumes) || 0;
          const totalIssues = pubBuckets + openSgs + unencVols;
          const details = [
            pubBuckets > 0 ? `${pubBuckets} Public S3` : '',
            openSgs > 0 ? `${openSgs} Open SG` : '',
            unencVols > 0 ? `${unencVols} Unencrypted EBS` : '',
          ].filter(Boolean).join(', ');
          return (
            <div
              onClick={() => router.push('/awsops/security')}
              className={`cursor-pointer transition-all hover:scale-[1.02] hover:border-accent-cyan/50 rounded-lg ${totalIssues > 0 ? 'ring-1 ring-accent-red/30' : ''}`}
              title={totalIssues > 0 ? `⚠ ${details} — Click to view details` : '✓ No security issues detected'}
            >
              <StatsCard label="Security Issues" value={totalIssues} icon={ShieldCheck}
                color={totalIssues > 0 ? 'red' : 'green'}
                change={totalIssues > 0 ? details : '✓ All clear'} />
            </div>
          );
        })()}
        <StatsCard label="K8s Pods" value={totalPods} icon={Box} color="pink"
          change={runningPodsCount > 0 ? `${runningPodsCount} running` : undefined} />
      </div>

      {/* Live Resources Grid */}
      <div>
        <h2 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Live Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <LiveResourceCard title="EC2" icon={Server} color="cyan"
            status={Number(running?.value) > 0 ? 'running' : (totalEC2 > 0 ? 'stopped' : 'inactive')}
            stats={[
              { label: 'Running', value: Number(running?.value) || 0 },
              { label: 'Total', value: totalEC2 },
            ]}
            lastChecked={lastUpdated?.toLocaleTimeString() || '--'} />

          <LiveResourceCard title="RDS" icon={Database} color="green"
            status={Number(rds?.total_instances) > 0 ? 'active' : 'inactive'}
            stats={[
              { label: 'Instances', value: Number(rds?.total_instances) || 0 },
              { label: 'Storage', value: `${Number(rds?.total_storage_gb) || 0} GB` },
            ]}
            lastChecked={lastUpdated?.toLocaleTimeString() || '--'} />

          <LiveResourceCard title="ECS" icon={Container} color="purple"
            status={Number(ecs?.total_clusters) > 0 ? 'running' : 'inactive'}
            stats={[
              { label: 'Clusters', value: Number(ecs?.total_clusters) || 0 },
              { label: 'Tasks', value: Number(ecs?.total_tasks) || 0 },
            ]}
            lastChecked={lastUpdated?.toLocaleTimeString() || '--'} />

          <LiveResourceCard title="Kubernetes" icon={Box} color="pink"
            status={Number(k8sNodes?.total_nodes) > 0 ? 'healthy' : 'inactive'}
            stats={[
              { label: 'Nodes', value: Number(k8sNodes?.total_nodes) || 0 },
              { label: 'Pods', value: totalPods },
              { label: 'Deploys', value: Number(k8sDeploy?.total_deployments) || 0 },
            ]}
            lastChecked={lastUpdated?.toLocaleTimeString() || '--'} />
        </div>
      </div>

      {/* Warnings + Recent K8s Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
          <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Resource Warnings</h3>
          {warnings.length === 0 && !loading ? (
            <p className="text-gray-500 text-sm">No warnings detected</p>
          ) : (
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-navy-900">
                  <w.icon size={16} className={w.severity === 'error' ? 'text-accent-red' : 'text-accent-orange'} />
                  <span className="text-sm">{w.text}</span>
                </div>
              ))}
            </div>
          )}
          {loading && warnings.length === 0 && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 skeleton rounded" />)}
            </div>
          )}
        </div>

        <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
          <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Recent K8s Events</h3>
          {k8sWarnings.length === 0 && !loading ? (
            <p className="text-gray-500 text-sm">No warning events</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {k8sWarnings.slice(0, 10).map((ev: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-navy-900 text-xs">
                  <AlertTriangle size={12} className="text-accent-orange mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-gray-400">{String(ev.namespace)}/{String(ev.name)}</span>
                    <span className="text-gray-500 ml-2">{String(ev.reason)}</span>
                    <p className="text-gray-300 mt-0.5">{String(ev.message).slice(0, 120)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {loading && k8sWarnings.length === 0 && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 skeleton rounded" />)}
            </div>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="EC2 Instance Types" data={(get('ec2Types') as { name: string; value: number }[]).slice(0, 8)} />
        <BarChartCard title="Resource Distribution" data={resourceCounts} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="RDS Engine Distribution" data={get('rdsEngines') as { name: string; value: number }[]} />
        <PieChartCard title="K8s Pod Status" data={[
          { name: 'Running', value: Number(podSum?.running_pods) || 0 },
          { name: 'Pending', value: Number(podSum?.pending_pods) || 0 },
          { name: 'Failed', value: Number(podSum?.failed_pods) || 0 },
          { name: 'Succeeded', value: Number(podSum?.succeeded_pods) || 0 },
        ].filter(d => d.value > 0)} />
      </div>
    </div>
  );
}
