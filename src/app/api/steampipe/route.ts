import { NextRequest, NextResponse } from 'next/server';
import { execSync, execFileSync } from 'child_process';
import { readFileSync as readFileSyncFs, appendFileSync, writeFileSync as writeFileSyncFs } from 'fs';
import { homedir } from 'os';
import { batchQuery, clearCache, checkCostAvailability, runCostQueriesPerAccount, resetPool } from '@/lib/steampipe';
import { saveSnapshot, getHistory } from '@/lib/resource-inventory';
import { saveCostSnapshot, getLatestCostSnapshot } from '@/lib/cost-snapshot';
import { getConfig, saveConfig, validateAccountId, getAccounts, isMultiAccount, getAllowedAccountIds, isAccountAllowed } from '@/lib/app-config';
import type { AccountConfig } from '@/lib/app-config';
import { getCacheWarmerStatus, ensureCacheWarmerStarted } from '@/lib/cache-warmer';
import { getUserFromRequest } from '@/lib/auth-utils';

const COST_QUERY_KEYS = ['monthlyCost', 'costSummary', 'dailyCost', 'serviceCost', 'costDetail'];

// Rate limiting for admin actions / 관리자 액션 레이트 제한
const adminRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;       // Max requests per window / 윈도우당 최대 요청
const RATE_LIMIT_WINDOW = 60000; // 1 minute window / 1분 윈도우

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = adminRateLimit.get(userId);
  if (!entry || now > entry.resetAt) {
    adminRateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function GET(request: NextRequest) {
  // Auto-start cache warmer on first request / 첫 요청 시 캐시 워머 자동 시작
  ensureCacheWarmerStarted();

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const bustCache = searchParams.get('bustCache') === 'true';
  const accountId = searchParams.get('accountId') || undefined;
  const safeAccountId = accountId && validateAccountId(accountId) ? accountId : undefined;

  if (action === 'cost-check') {
    try {
      const result = await checkCostAvailability(bustCache, safeAccountId);
      return NextResponse.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cost check failed';
      return NextResponse.json({ available: false, reason: message }, { status: 500 });
    }
  }

  if (action === 'accounts') {
    return NextResponse.json({ accounts: getAccounts() });
  }

  // Admin check — client calls before rendering /accounts page / 클라이언트에서 /accounts 접근 전 확인
  if (action === 'admin-check') {
    const user = getUserFromRequest(request);
    const config = getConfig();
    const adminEmails = config.adminEmails || [];
    const isAdmin = user.email !== 'anonymous' && (adminEmails.length === 0 || adminEmails.includes(user.email));
    return NextResponse.json({ isAdmin, email: user.email });
  }

  if (action === 'inventory') {
    try {
      const days = parseInt(searchParams.get('days') || '90');
      const history = await getHistory(days, safeAccountId);
      return NextResponse.json({ history });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Inventory fetch failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Department-based account filtering — returns allowed account IDs for current user
  // 부서 기반 계정 필터링 — 현재 사용자에게 허용된 계정 ID 반환
  if (action === 'allowed-accounts') {
    const user = getUserFromRequest(request);
    const allowedAccountIds = getAllowedAccountIds(user.groups);
    return NextResponse.json({ allowedAccountIds });
  }

  if (action === 'config') {
    return NextResponse.json(getConfig());
  }

  if (action === 'cache-status') {
    return NextResponse.json(getCacheWarmerStatus());
  }

  if (action === 'cost-snapshot') {
    try {
      const snapshot = await getLatestCostSnapshot(safeAccountId);
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
    { error: 'Unknown action. Valid: cost-check, accounts, inventory, cost-snapshot, config' },
    { status: 400 }
  );
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const adminActions = ['add-account', 'remove-account', 'init-host'];
    if (action && adminActions.includes(action)) {
      const user = getUserFromRequest(request);
      if (user.email === 'anonymous') {
        return NextResponse.json({ error: 'Authentication required for account management.' }, { status: 401 });
      }
      // Admin email check — only adminEmails in config can manage accounts / adminEmails만 계정 관리 가능
      const config = getConfig();
      const adminEmails = config.adminEmails || [];
      if (adminEmails.length > 0 && !adminEmails.includes(user.email)) {
        return NextResponse.json({ error: 'Access denied. Admin privileges required.' }, { status: 403 });
      }
      // Rate limit: max 5 admin actions per minute per user / 사용자당 분당 5회 제한
      if (!checkRateLimit(user.email)) {
        return NextResponse.json({ error: 'Too many requests. Please wait before retrying.' }, { status: 429 });
      }
      console.log(`[ADMIN] ${action} by ${user.email} (${user.sub})`);
    }

    if (action === 'config') {
      const body = await request.json();
      if (typeof body.costEnabled === 'boolean') {
        saveConfig({ costEnabled: body.costEnabled });
        clearCache(); // cost-check 캐시 무효화
      }
      return NextResponse.json(getConfig());
    }

    if (action === 'init-host') {
      const body = await request.json();

      const config = getConfig();
      const accounts = config.accounts || [];

      // Already has host → skip
      if (accounts.some(a => a.isHost)) {
        return NextResponse.json({ accounts, message: 'Host account already registered.' });
      }

      // Detect current EC2 account ID
      let hostAccountId: string;
      try {
        const identity = JSON.parse(
          execSync('aws sts get-caller-identity --output json', { encoding: 'utf-8', timeout: 10000 })
        );
        hostAccountId = identity.Account;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to detect host account';
        return NextResponse.json({ error: `Cannot detect host account: ${message}` }, { status: 500 });
      }

      // Detect features
      let costEnabled = false;
      let eksEnabled = false;
      try {
        execSync(
          `aws ce get-cost-and-usage --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) --granularity DAILY --metrics BlendedCost --output json`,
          { timeout: 15000, encoding: 'utf-8' }
        );
        costEnabled = true;
      } catch {}
      try {
        execSync('aws eks list-clusters --output json', { timeout: 15000, encoding: 'utf-8' });
        eksEnabled = true;
      } catch {}

      const hostAccount: AccountConfig = {
        accountId: hostAccountId,
        alias: (body.alias as string)?.trim() || 'Host',
        connectionName: `aws_${hostAccountId}`,
        region: (body.region as string) || 'ap-northeast-2',
        isHost: true,
        features: { costEnabled, eksEnabled, k8sEnabled: false },
        // NO profile — host uses EC2 default credentials
      };

      accounts.unshift(hostAccount);
      saveConfig({ accounts });

      return NextResponse.json({ accounts, hostAccountId });
    }

    if (action === 'add-account') {
      const body = await request.json();
      const { accountId, alias, region } = body as {
        accountId: string;
        alias: string;
        region: string;
      };

      if (!validateAccountId(accountId)) {
        return NextResponse.json({ error: 'Invalid account ID. Must be 12 digits.' }, { status: 400 });
      }
      if (!alias || !alias.trim()) {
        return NextResponse.json({ error: 'Alias is required.' }, { status: 400 });
      }

      // Alias validation: characters + length / Alias 검증: 문자 + 길이
      const ALIAS_PATTERN = /^[\w\s-]+$/;
      const trimmedAlias = alias.trim();
      if (trimmedAlias.length > 64) {
        return NextResponse.json({ error: 'Alias too long. Maximum 64 characters.' }, { status: 400 });
      }
      if (!ALIAS_PATTERN.test(trimmedAlias)) {
        return NextResponse.json({ error: 'Alias contains invalid characters. Use letters, numbers, spaces, hyphens, underscores only.' }, { status: 400 });
      }

      // Region format validation (Section 6)
      const REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
      if (region && !REGION_PATTERN.test(region)) {
        return NextResponse.json({ error: 'Invalid region format. Example: ap-northeast-2' }, { status: 400 });
      }

      const config = getConfig();
      const accounts = config.accounts || [];

      // Check for duplicate
      if (accounts.some(a => a.accountId === accountId)) {
        return NextResponse.json({ error: 'Account already exists.' }, { status: 409 });
      }

      const warnings: string[] = [];
      const profileName = `awsops-${accountId}`;
      const connectionName = `aws_${accountId}`;
      const accountRegion = region || 'ap-northeast-2';

      // --- Step 0: Auto-register host account if not yet registered ---
      if (!accounts.some(a => a.isHost)) {
        try {
          const identity = JSON.parse(
            execSync('aws sts get-caller-identity --output json', { encoding: 'utf-8', timeout: 10000 })
          );
          const hostAccountId = identity.Account as string;

          // Detect host features
          let hostCostEnabled = false;
          let hostEksEnabled = false;
          try { execSync('aws ce get-cost-and-usage --time-period Start=$(date -d "7 days ago" +%Y-%m-%d),End=$(date +%Y-%m-%d) --granularity DAILY --metrics BlendedCost --output json', { timeout: 8000, encoding: 'utf-8' }); hostCostEnabled = true; } catch {}
          try { execSync('aws eks list-clusters --output json', { timeout: 5000, encoding: 'utf-8' }); hostEksEnabled = true; } catch {}

          const hostAccount: AccountConfig = {
            accountId: hostAccountId,
            alias: 'Host',
            connectionName: `aws_${hostAccountId}`,
            region: accountRegion,
            isHost: true,
            features: { costEnabled: hostCostEnabled, eksEnabled: hostEksEnabled, k8sEnabled: false },
          };
          accounts.unshift(hostAccount);

          // Rename existing "connection "aws"" to "connection "aws_{hostAccountId}"" in Steampipe config
          const spcPath = `${homedir()}/.steampipe/config/aws.spc`;
          try {
            let spcContent = readFileSyncFs(spcPath, 'utf-8');
            // Replace first bare connection "aws" (non-aggregator) with connection "aws_{hostId}"
            spcContent = spcContent.replace(
              /^(connection\s+"aws"\s*\{[^}]*plugin\s*=\s*"aws")/m,
              (match) => {
                // Only rename if it's NOT the aggregator
                if (match.includes('aggregator')) return match;
                return match.replace('connection "aws"', `connection "aws_${hostAccountId}"`);
              }
            );
            // Add aggregator if not present
            if (!spcContent.includes('type        = "aggregator"') && !spcContent.includes('type = "aggregator"')) {
              spcContent += `\nconnection "aws" {\n  plugin      = "aws"\n  type        = "aggregator"\n  connections = ["aws_*"]\n}\n`;
            }
            writeFileSyncFs(spcPath, spcContent, 'utf-8');
          } catch (err) {
            warnings.push(`Host Steampipe config: ${err instanceof Error ? err.message : 'Failed'}`);
          }
        } catch (err) {
          warnings.push(`Host auto-detect: ${err instanceof Error ? err.message : 'Failed'}`);
        }
      }

      // --- Step 1: Create AWS CLI profile (~/.aws/config) ---
      try {
        const awsConfigPath = `${homedir()}/.aws/config`;
        const roleArn = `arn:aws:iam::${accountId}:role/AWSopsReadOnlyRole`;
        if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(roleArn)) {
          return NextResponse.json({ error: 'Invalid role ARN constructed' }, { status: 400 });
        }
        const profileBlock = `\n[profile ${profileName}]\nrole_arn = ${roleArn}\ncredential_source = Ec2InstanceMetadata\nregion = ${accountRegion}\n`;

        let existingConfig = '';
        try { existingConfig = readFileSyncFs(awsConfigPath, 'utf-8'); } catch { /* file may not exist */ }
        if (!existingConfig.includes(`[profile ${profileName}]`)) {
          appendFileSync(awsConfigPath, profileBlock, 'utf-8');
        }
      } catch (err) {
        warnings.push(`Step 1 (AWS CLI profile): ${err instanceof Error ? err.message : 'Failed'}`);
      }

      // --- Step 2: Create Steampipe connection (~/.steampipe/config/aws.spc) ---
      try {
        const spcPath = `${homedir()}/.steampipe/config/aws.spc`;
        const connectionBlock = `\nconnection "${connectionName}" {\n  plugin  = "aws"\n  profile = "${profileName}"\n  regions = ["${accountRegion}"]\n  ignore_error_codes = ["AccessDenied", "AccessDeniedException", "NotAuthorized", "UnauthorizedAccess", "AuthorizationError"]\n}\n`;

        let existingSpc = '';
        try { existingSpc = readFileSyncFs(spcPath, 'utf-8'); } catch { /* file may not exist */ }
        if (!existingSpc.includes(`connection "${connectionName}"`)) {
          appendFileSync(spcPath, connectionBlock, 'utf-8');
        }
      } catch (err) {
        warnings.push(`Step 2 (Steampipe connection): ${err instanceof Error ? err.message : 'Failed'}`);
      }

      // --- Step 3: Detect features (Cost Explorer, EKS) ---
      let costEnabled = false;
      let eksEnabled = false;
      try {
        execSync(
          `aws ce get-cost-and-usage --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) --granularity DAILY --metrics BlendedCost --profile ${profileName} --output json`,
          { timeout: 15000, encoding: 'utf-8' }
        );
        costEnabled = true;
      } catch { /* Cost Explorer not available */ }
      try {
        execSync(
          `aws eks list-clusters --profile ${profileName} --output json`,
          { timeout: 15000, encoding: 'utf-8' }
        );
        eksEnabled = true;
      } catch { /* EKS not available */ }

      // --- Step 4: IAM policy note (skip — dangerous via API) ---
      warnings.push('Please manually update the EC2 instance role AssumeRole policy to allow sts:AssumeRole for the new account role.');

      // --- Step 5: Save to config.json ---
      const newAccount: AccountConfig = {
        accountId,
        alias: alias.trim(),
        connectionName,
        region: accountRegion,
        isHost: false,
        features: { costEnabled, eksEnabled, k8sEnabled: false },
        profile: profileName,
      };

      accounts.push(newAccount);
      saveConfig({ accounts });

      // --- Step 6: Restart Steampipe + resetPool ---
      try {
        execSync('steampipe service restart --force', { timeout: 30000, encoding: 'utf-8' });
      } catch (err) {
        warnings.push(`Step 6 (Steampipe restart): ${err instanceof Error ? err.message : 'Failed'}`);
      }
      try {
        await resetPool();
      } catch (err) {
        warnings.push(`Step 6 (Pool reset): ${err instanceof Error ? err.message : 'Failed'}`);
      }

      return NextResponse.json({
        accounts,
        features: { costEnabled, eksEnabled, k8sEnabled: false },
        warnings,
      });
    }

    if (action === 'test-account') {
      const body = await request.json();
      const { accountId, roleName } = body as { accountId: string; roleName?: string };

      if (!validateAccountId(accountId)) {
        return NextResponse.json({ success: false, message: 'Invalid account ID.' });
      }

      const role = roleName || 'AWSopsReadOnlyRole';
      // C1 Fix: roleName injection 방지
      if (!/^[\w+=,.@-]+$/.test(role)) {
        return NextResponse.json({ success: false, message: 'Invalid role name format.' });
      }
      const roleArn = `arn:aws:iam::${accountId}:role/${role}`;
      if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(roleArn)) {
        return NextResponse.json({ success: false, message: 'Invalid role ARN format.' });
      }

      try {
        const result = execFileSync('aws', [
          'sts', 'assume-role',
          '--role-arn', roleArn,
          '--role-session-name', 'awsops-test',
          '--query', 'Account',
          '--output', 'text',
        ], { encoding: 'utf-8', timeout: 15000 }).trim();
        return NextResponse.json({
          success: true,
          message: `Successfully assumed role in account ${result}`,
        });
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : 'AssumeRole failed';
        const firstLine = rawMsg.split('\n')[0].slice(0, 200);
        const sanitized = firstLine
          .replace(/arn:aws:[^\s"']+/g, 'arn:***')
          .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '*.*.*.*');
        return NextResponse.json({ success: false, message: `AssumeRole failed: ${sanitized}` });
      }
    }

    if (action === 'remove-account') {
      const body = await request.json();
      const { accountId } = body as { accountId: string };

      if (!validateAccountId(accountId)) {
        return NextResponse.json({ error: 'Invalid account ID.' }, { status: 400 });
      }

      const config = getConfig();
      const accounts = config.accounts || [];

      const target = accounts.find(a => a.accountId === accountId);
      if (!target) {
        return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      }
      if (target.isHost) {
        return NextResponse.json({ error: 'Cannot remove the host account.' }, { status: 403 });
      }

      const updated = accounts.filter(a => a.accountId !== accountId);
      saveConfig({ accounts: updated });

      return NextResponse.json({ accounts: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Auto-start cache warmer on first request / 첫 요청 시 캐시 워머 자동 시작
  ensureCacheWarmerStarted();

  try {
    const { searchParams } = new URL(request.url);
    const bustCache = searchParams.get('bustCache') === 'true';

    const body = await request.json();

    // EKS Access Entry registration / EKS Access Entry 등록
    if (body.action === 'eks-register-access') {
      const { clusterName, region, principalArn } = body as { clusterName: string; region: string; principalArn: string };
      if (!clusterName || !principalArn) {
        return NextResponse.json({ error: 'clusterName and principalArn required' }, { status: 400 });
      }
      try {
        // Step 1: Create access entry / Access Entry 생성
        try {
          execFileSync('aws', ['eks', 'create-access-entry',
            '--cluster-name', clusterName, '--region', region || 'ap-northeast-2',
            '--principal-arn', principalArn, '--type', 'STANDARD',
          ], { timeout: 15000 });
        } catch (e: any) {
          const stderr = e.stderr?.toString() || '';
          if (!stderr.includes('ResourceInUseException') && !stderr.includes('already exists')) {
            return NextResponse.json({ error: `Access Entry 생성 실패: ${stderr.slice(0, 200)}` });
          }
          // Already exists — continue to policy association
        }
        // Step 2: Associate AdminView policy / AdminView 정책 연결
        try {
          execFileSync('aws', ['eks', 'associate-access-policy',
            '--cluster-name', clusterName, '--region', region || 'ap-northeast-2',
            '--principal-arn', principalArn,
            '--policy-arn', 'arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminViewPolicy',
            '--access-scope', 'type=cluster',
          ], { timeout: 15000 });
        } catch (e: any) {
          const stderr = e.stderr?.toString() || '';
          if (!stderr.includes('ResourceInUseException') && !stderr.includes('already exists')) {
            return NextResponse.json({ error: `Policy 연결 실패: ${stderr.slice(0, 200)}` });
          }
        }
        // Step 3: Generate kubeconfig / kubeconfig 생성
        try {
          execFileSync('aws', ['eks', 'update-kubeconfig',
            '--name', clusterName, '--region', region || 'ap-northeast-2',
          ], { timeout: 15000 });
        } catch {}
        return NextResponse.json({ message: `${clusterName}: Access Entry + AdminViewPolicy 등록 완료` });
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Unknown error' });
      }
    }

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

    const safeAccountId = accountId && validateAccountId(accountId) ? accountId : undefined;

    // Department-based authorization: verify user can access the requested account
    // 부서 기반 권한 검증: 요청된 계정 접근 허용 여부 확인
    const user = getUserFromRequest(request);
    if (!isAccountAllowed(safeAccountId, user.groups)) {
      return NextResponse.json(
        { error: 'Access denied. Your department does not have access to this account.' },
        { status: 403 }
      );
    }

    let results: Record<string, { rows: unknown[]; error?: string }>;

    // Multi-account: when "All Accounts" selected and cost queries present, split execution
    // 멀티 어카운트: "전체 계정" 선택 + 비용 쿼리 포함 시 실행 분리
    const hasCostQueries = Object.keys(queries).some(k => COST_QUERY_KEYS.includes(k));

    if (!safeAccountId && isMultiAccount() && hasCostQueries) {
      // Split into cost and non-cost query groups / 비용/비비용 쿼리 그룹 분리
      const costQueries: Record<string, string> = {};
      const nonCostQueries: Record<string, string> = {};
      for (const [key, sql] of Object.entries(queries)) {
        if (COST_QUERY_KEYS.includes(key)) {
          costQueries[key] = sql;
        } else {
          nonCostQueries[key] = sql;
        }
      }

      // Run cost queries per-account and non-cost queries normally / 비용 쿼리는 계정별, 나머지는 일반 실행
      const [costResults, nonCostResults] = await Promise.all([
        Object.keys(costQueries).length > 0 ? runCostQueriesPerAccount(costQueries) : {},
        Object.keys(nonCostQueries).length > 0 ? batchQuery(nonCostQueries, { bustCache }) : {},
      ]);

      results = { ...nonCostResults, ...costResults };
    } else {
      results = await batchQuery(queries, { bustCache, accountId: safeAccountId });
    }

    // 대시보드 요청 시 리소스 인벤토리 스냅샷 백그라운드 저장
    if (saveInventory) {
      saveSnapshot(results, safeAccountId).catch(() => {});
    }

    // 비용 쿼리 성공 시 스냅샷 백그라운드 저장 (dashboard costSummary or cost page monthlyCost)
    if (results['monthlyCost']?.rows?.length || results['costSummary']?.rows?.length) {
      saveCostSnapshot(results, safeAccountId).catch(() => {});
    }

    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
