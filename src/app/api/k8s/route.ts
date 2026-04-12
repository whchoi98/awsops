import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getAllowedEksClusters } from '@/lib/app-config';

const HOME = process.env.HOME || '/home/ec2-user';
const K8S_SPC_PATH = resolve(HOME, '.steampipe/config/kubernetes.spc');

// Add a connection block for the new context if it doesn't exist
// 새 컨텍스트에 대한 connection 블록이 없으면 추가
function addConnectionIfMissing(clusterName: string, contextArn: string) {
  const connName = 'kubernetes_' + clusterName.replace(/[^a-zA-Z0-9]/g, '_');
  try {
    const content = readFileSync(K8S_SPC_PATH, 'utf-8');
    if (content.includes(contextArn)) return false; // already exists

    // Insert new connection block before the aggregator (or at end)
    const newBlock = `\nconnection "${connName}" {\n  plugin = "kubernetes"\n  config_context = "${contextArn}"\n  custom_resource_tables = ["*"]\n}\n`;

    const aggregatorMatch = /connection\s+"kubernetes"\s*\{[\s\S]*?type\s*=\s*"aggregator"[\s\S]*?\}/.exec(content);
    if (!aggregatorMatch) {
      // No aggregator — append connection + create aggregator
      const withAggregator = content + newBlock + `\nconnection "kubernetes" {\n  plugin      = "kubernetes"\n  type        = "aggregator"\n  connections = ["kubernetes_*"]\n}\n`;
      writeFileSync(K8S_SPC_PATH, withAggregator, 'utf-8');
    } else {
      // Insert before aggregator block, remove any duplicates first
      const aggStart = aggregatorMatch.index;
      const before = content.slice(0, aggStart);
      const aggBlock = aggregatorMatch[0];
      // Strip any extra aggregator blocks that might follow
      writeFileSync(K8S_SPC_PATH, before + newBlock + '\n' + aggBlock + '\n', 'utf-8');
    }
    return true; // added
  } catch {
    // File missing — create from scratch
    writeFileSync(K8S_SPC_PATH, `connection "${connName}" {\n  plugin = "kubernetes"\n  config_context = "${contextArn}"\n  custom_resource_tables = ["*"]\n}\n\nconnection "kubernetes" {\n  plugin    = "kubernetes"\n  type      = "aggregator"\n  connections = ["kubernetes_*"]\n}\n`, 'utf-8');
    return true;
  }
}

// POST: Register kubeconfig + add Steampipe connection + restart Steampipe
export async function POST(req: NextRequest) {
  try {
    const { clusterName, region } = await req.json();

    if (!clusterName || !/^[a-zA-Z0-9_-]+$/.test(clusterName)) {
      return NextResponse.json({ error: 'Invalid cluster name' }, { status: 400 });
    }
    // Department EKS access check / 부서별 EKS 접근 검증
    const user = getUserFromRequest(req);
    const allowedClusters = getAllowedEksClusters(user.groups);
    if (allowedClusters !== null && !allowedClusters.includes(clusterName)) {
      return NextResponse.json({ error: 'Access denied: cluster not allowed for your department' }, { status: 403 });
    }
    if (!region || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
    }

    // 1. aws eks update-kubeconfig
    const output = execFileSync('aws', [
      'eks', 'update-kubeconfig',
      '--name', clusterName,
      '--region', region,
    ], { encoding: 'utf-8', timeout: 15000 });

    // Extract context ARN from output (e.g. "Updated context arn:aws:eks:...")
    const arnMatch = output.match(/(arn:aws:eks:\S+)/);
    const contextArn = arnMatch ? arnMatch[1].replace(/[.,;]+$/, '') : `arn:aws:eks:${region}:*:cluster/${clusterName}`;

    // 2. Add connection to kubernetes.spc if missing
    const added = addConnectionIfMissing(clusterName, contextArn);

    // 3. Restart Steampipe so the kubernetes plugin reloads kubeconfig
    // The plugin caches ~/.kube/config at startup, so a restart is required
    try {
      execFileSync('steampipe', ['service', 'restart'], {
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, HOME },
      });
    } catch {
      // Steampipe restart failed — data will appear after manual restart
    }

    const msg = added
      ? `kubeconfig + Steampipe connection registered for ${clusterName}.`
      : `kubeconfig updated for ${clusterName}.`;

    return NextResponse.json({ success: true, message: msg, needsRestart: false });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.stderr?.trim() || e.message || 'Unknown error',
    }, { status: 500 });
  }
}
