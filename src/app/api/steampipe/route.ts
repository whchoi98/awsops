import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { existsSync, readFileSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { batchQuery, clearCache, checkCostAvailability, resetPool } from '@/lib/steampipe';
import { saveSnapshot, getHistory } from '@/lib/resource-inventory';
import { saveCostSnapshot, getLatestCostSnapshot } from '@/lib/cost-snapshot';
import { getConfig, saveConfig, getAccounts, isMultiAccount } from '@/lib/app-config';
import type { AccountConfig } from '@/lib/app-config';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const bustCache = searchParams.get('bustCache') === 'true';

  if (action === 'cost-check') {
    try {
      const result = await checkCostAvailability(bustCache);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cost check failed';
      return NextResponse.json({ available: false, reason: message }, { status: 500 });
    }
  }

  if (action === 'inventory') {
    try {
      const days = parseInt(searchParams.get('days') || '90');
      const accountId = searchParams.get('accountId') || undefined;
      const history = await getHistory(days, accountId);
      return NextResponse.json({ history });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Inventory fetch failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === 'config') {
    return NextResponse.json(getConfig());
  }

  if (action === 'accounts') {
    return NextResponse.json({
      accounts: getAccounts(),
      isMultiAccount: isMultiAccount(),
    });
  }

  if (action === 'cost-snapshot') {
    try {
      const accountId = searchParams.get('accountId') || undefined;
      const snapshot = await getLatestCostSnapshot(accountId);
      if (!snapshot) {
        return NextResponse.json({ error: 'No cost snapshot available' }, { status: 404 });
      }
      return NextResponse.json(snapshot);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cost snapshot fetch failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: 'Unknown action. Valid: cost-check, inventory, cost-snapshot, config, accounts' },
    { status: 400 }
  );
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'config') {
      const body = await request.json();
      if (typeof body.costEnabled === 'boolean') {
        saveConfig({ costEnabled: body.costEnabled });
        clearCache();
      }
      return NextResponse.json(getConfig());
    }

    if (action === 'test-account') {
      const body = await request.json();
      const { accountId, roleArn: customRoleArn } = body as { accountId: string; roleArn?: string };
      if (!accountId || !/^\d{12}$/.test(accountId)) {
        return NextResponse.json({ error: 'Valid 12-digit accountId required' }, { status: 400 });
      }
      if (customRoleArn && !/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(customRoleArn)) {
        return NextResponse.json({ error: 'Invalid role ARN format' }, { status: 400 });
      }
      const roleArn = customRoleArn || `arn:aws:iam::${accountId}:role/AWSopsReadOnlyRole`;
      const profileName = `awsops-${accountId}`;
      // Ensure profile exists
      const awsConfig = join(homedir(), '.aws/config');
      const cfgContent = existsSync(awsConfig) ? readFileSync(awsConfig, 'utf-8') : '';
      if (!cfgContent.includes(`[profile ${profileName}]`)) {
        appendFileSync(awsConfig, `\n[profile ${profileName}]\nrole_arn = ${roleArn}\ncredential_source = Ec2InstanceMetadata\nregion = ap-northeast-2\n`, 'utf-8');
      }
      try {
        const identity = execSync(`aws sts get-caller-identity --profile ${profileName} --output json 2>/dev/null`, { encoding: 'utf-8', timeout: 15000 });
        const parsed = JSON.parse(identity);
        return NextResponse.json({ success: true, identity: parsed.Arn, accountId: parsed.Account });
      } catch {
        return NextResponse.json({ success: false, error: `AssumeRole 실패: ${roleArn}. Target 어카운트에 해당 Role이 존재하는지 확인하세요.` }, { status: 400 });
      }
    }

    if (action === 'add-account') {
      const body = await request.json();
      const { accountId, alias, region, roleArn: customRoleArn } = body as { accountId: string; alias: string; region?: string; roleArn?: string };

      if (!accountId || !/^\d{12}$/.test(accountId)) {
        return NextResponse.json({ error: 'Valid 12-digit accountId required' }, { status: 400 });
      }
      if (!alias || !/^[\w\s-]+$/.test(alias)) {
        return NextResponse.json({ error: 'Invalid alias format (alphanumeric, spaces, hyphens only)' }, { status: 400 });
      }
      if (customRoleArn && !/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(customRoleArn)) {
        return NextResponse.json({ error: 'Invalid role ARN format' }, { status: 400 });
      }
      const acctRegion = region && /^[a-z]{2}-[a-z]+-\d$/.test(region) ? region : 'ap-northeast-2';
      const profileName = `awsops-${accountId}`;
      const connectionName = `aws_${accountId}`;
      const roleArn = customRoleArn || `arn:aws:iam::${accountId}:role/AWSopsReadOnlyRole`;

      // Step 0: Ensure host EC2 role has sts:AssumeRole
      try {
        const hostRoleArn = execSync('aws sts get-caller-identity --query Arn --output text 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
        const hostRoleName = hostRoleArn.match(/assumed-role\/([^/]+)/)?.[1];
        if (hostRoleName) {
          const policyName = 'AWSopsAssumeRole';
          // Scope to registered account IDs only (not wildcard)
          const registeredIds = (getConfig().accounts || []).map((a: any) => a.accountId).filter(Boolean);
          registeredIds.push(accountId);
          const resources = Array.from(new Set(registeredIds)).map((id: string) => `arn:aws:iam::${id}:role/AWSopsReadOnlyRole`);
          const policyDoc = JSON.stringify({
            Version: '2012-10-17',
            Statement: [{ Effect: 'Allow', Action: 'sts:AssumeRole', Resource: resources }],
          });
          execSync(`aws iam put-role-policy --role-name "${hostRoleName}" --policy-name "${policyName}" --policy-document '${policyDoc}' 2>/dev/null`, { timeout: 10000 });
        }
      } catch { /* permission may already exist or IAM write not allowed */ }

      // Step 1: Test cross-account access
      try {
        execSync(`aws sts get-caller-identity --profile ${profileName} --output json 2>/dev/null`, { encoding: 'utf-8', timeout: 10000 });
      } catch {
        // Profile doesn't exist yet — create it
        const awsConfig = join(homedir(), '.aws/config');
        const profileBlock = `\n[profile ${profileName}]\nrole_arn = ${roleArn}\ncredential_source = Ec2InstanceMetadata\nregion = ${acctRegion}\n`;
        appendFileSync(awsConfig, profileBlock, 'utf-8');

        // Test again
        try {
          execSync(`aws sts get-caller-identity --profile ${profileName} --output json 2>/dev/null`, { encoding: 'utf-8', timeout: 15000 });
        } catch {
          return NextResponse.json({
            error: 'Cross-account access failed. Ensure AWSopsReadOnlyRole exists in target account.',
            roleArn,
            hint: 'Deploy infra-cdk/cfn-target-account-role.yaml in the target account first.',
          }, { status: 400 });
        }
      }

      // Step 2: Add Steampipe connection
      const spcFile = join(homedir(), '.steampipe/config/aws.spc');
      const spcContent = existsSync(spcFile) ? readFileSync(spcFile, 'utf-8') : '';
      if (!spcContent.includes(`connection "${connectionName}"`)) {
        const connBlock = `\nconnection "${connectionName}" {\n  plugin  = "aws"\n  profile = "${profileName}"\n  regions = ["${acctRegion}"]\n  ignore_error_codes = [\n    "AccessDenied",\n    "AccessDeniedException",\n    "NotAuthorized",\n    "UnauthorizedOperation",\n    "UnrecognizedClientException",\n    "AuthorizationError"\n  ]\n}\n`;
        appendFileSync(spcFile, connBlock, 'utf-8');
      }

      // Step 3: Detect features
      let costEnabled = false;
      try {
        execSync(`aws ce get-cost-and-usage --profile ${profileName} --time-period Start=$(date -d '1 month ago' +%Y-%m-01),End=$(date +%Y-%m-01) --granularity MONTHLY --metrics BlendedCost --output json 2>/dev/null`, { encoding: 'utf-8', timeout: 10000 });
        costEnabled = true;
      } catch {}

      let eksEnabled = false;
      try {
        const eksOut = execSync(`aws eks list-clusters --profile ${profileName} --query 'clusters[0]' --output text 2>/dev/null`, { encoding: 'utf-8', timeout: 10000 }).trim();
        if (eksOut && eksOut !== 'None') eksEnabled = true;
      } catch {}

      // Step 4: Update config.json
      const config = getConfig();
      const accounts: AccountConfig[] = config.accounts || [];
      const newEntry: AccountConfig = {
        accountId, alias, connectionName, profile: profileName, region: acctRegion,
        features: { costEnabled, eksEnabled, k8sEnabled: false },
      };
      const idx = accounts.findIndex(a => a.accountId === accountId);
      if (idx >= 0) accounts[idx] = newEntry;
      else accounts.push(newEntry);
      saveConfig({ accounts });

      // Step 5: Restart Steampipe + reset pg Pool
      try {
        execSync('steampipe service restart 2>/dev/null || steampipe service start --database-listen network --database-port 9193 2>/dev/null', { timeout: 30000 });
      } catch {}

      // Pool 리셋: stale 연결 정리 + DB 준비 대기
      await resetPool();

      return NextResponse.json({
        success: true,
        account: newEntry,
        message: `Account ${alias} (${accountId}) added. Rebuild needed: npm run build`,
      });
    }

    if (action === 'remove-account') {
      const body = await request.json();
      const { accountId } = body as { accountId: string };
      if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

      // Remove from config.json
      const config = getConfig();
      const accounts = (config.accounts || []).filter(a => a.accountId !== accountId);
      saveConfig({ accounts });

      // Note: Steampipe connection and AWS profile are left in place (safe to keep)
      clearCache();

      return NextResponse.json({
        success: true,
        message: `Account ${accountId} removed from config. Steampipe connection preserved.`,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bustCache = searchParams.get('bustCache') === 'true';

    const body = await request.json();
    const { queries, saveInventory, accountId } = body as {
      queries: Record<string, string>;
      saveInventory?: boolean;
      accountId?: string;
    };

    if (!queries || typeof queries !== 'object') {
      return NextResponse.json(
        { error: 'Request body must contain a "queries" object' },
        { status: 400 }
      );
    }

    if (bustCache) {
      clearCache();
    }

    const results = await batchQuery(queries, { bustCache, accountId });

    // 대시보드 요청 시 리소스 인벤토리 스냅샷 백그라운드 저장
    if (saveInventory) {
      saveSnapshot(results, accountId).catch(() => {});
    }

    // 비용 쿼리 성공 시 스냅샷 백그라운드 저장 (dashboard costSummary or cost page monthlyCost)
    if (results['monthlyCost']?.rows?.length || results['costSummary']?.rows?.length) {
      saveCostSnapshot(results, accountId).catch(() => {});
    }

    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
