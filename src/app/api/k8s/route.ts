import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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

    const aggregatorIdx = content.indexOf('type      = "aggregator"');
    if (aggregatorIdx === -1) {
      // No aggregator — append connection + create aggregator
      const withAggregator = content + newBlock + `\nconnection "kubernetes" {\n  plugin    = "kubernetes"\n  type      = "aggregator"\n  connections = ["kubernetes_*"]\n}\n`;
      writeFileSync(K8S_SPC_PATH, withAggregator, 'utf-8');
    } else {
      // Insert before aggregator block
      const aggStart = content.lastIndexOf('connection "kubernetes"', aggregatorIdx);
      const before = content.slice(0, aggStart);
      const after = content.slice(aggStart);
      writeFileSync(K8S_SPC_PATH, before + newBlock + '\n' + after, 'utf-8');
    }
    return true; // added
  } catch {
    // File missing — create from scratch
    writeFileSync(K8S_SPC_PATH, `connection "${connName}" {\n  plugin = "kubernetes"\n  config_context = "${contextArn}"\n  custom_resource_tables = ["*"]\n}\n\nconnection "kubernetes" {\n  plugin    = "kubernetes"\n  type      = "aggregator"\n  connections = ["kubernetes_*"]\n}\n`, 'utf-8');
    return true;
  }
}

// POST: Register kubeconfig + add Steampipe connection (no restart)
export async function POST(req: NextRequest) {
  try {
    const { clusterName, region } = await req.json();

    if (!clusterName || !/^[a-zA-Z0-9_-]+$/.test(clusterName)) {
      return NextResponse.json({ error: 'Invalid cluster name' }, { status: 400 });
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
    const arnMatch = output.match(/(arn:aws:eks:[^\\s]+)/);
    const contextArn = arnMatch ? arnMatch[1] : `arn:aws:eks:${region}:*:cluster/${clusterName}`;

    // 2. Add connection to kubernetes.spc if missing
    const added = addConnectionIfMissing(clusterName, contextArn);

    const msg = added
      ? `kubeconfig + Steampipe connection added for ${clusterName}. Restart Steampipe to apply.`
      : `kubeconfig updated for ${clusterName} (connection already exists).`;

    return NextResponse.json({ success: true, message: msg, needsRestart: added });
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.stderr?.trim() || e.message || 'Unknown error',
    }, { status: 500 });
  }
}
