import { verifyUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { registerCluster, unregisterCluster, isEnvCluster, setClusterAuth, type EksAuth } from '@/lib/eks-registry';
import { hasAccessEntry, onboardingGuide } from '@/lib/eks-access';
import { listClusters } from '@/lib/aws';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

// EKS CreateCluster's official name pattern is ^[0-9A-Za-z][A-Za-z0-9\-_]*$ (underscores ARE
// accepted by the API — PR #36 review suggested dropping them, but that would reject legal
// clusters). {0,99} caps at 100 chars — also the official EKS name-length limit. Injection
// into the CLI guide is already double-guarded: this charset + the
// listClusters() existence check below.
// Hyphen escaped for unambiguity (panel r5: verified literal in JS either way — ':' '<' '@' all reject).
const CLUSTER_NAME_RE = /^[0-9A-Za-z][A-Za-z0-9\-_]{0,99}$/;

// Aurora-stored auth (v1 kubeconfig parity): validated shapes only; token/roleArn are write-only.
const ROLE_ARN_RE = /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]{1,128}$/;
function parseAuth(body: unknown): EksAuth | null | 'invalid' {
  if (!body || typeof body !== 'object') return null;
  const a = (body as { auth?: unknown }).auth;
  if (a == null) return null;
  if (typeof a !== 'object') return 'invalid';
  const o = a as Record<string, unknown>;
  if (o.mode === 'sa-token') {
    const token = typeof o.token === 'string' ? o.token.trim() : '';
    if (!token || token.length > 16384 || /\s/.test(token)) return 'invalid';
    return { mode: 'sa-token', token };
  }
  if (o.mode === 'assume-role') {
    const roleArn = typeof o.roleArn === 'string' ? o.roleArn.trim() : '';
    if (!ROLE_ARN_RE.test(roleArn)) return 'invalid';
    const externalId = typeof o.externalId === 'string' && o.externalId.trim() ? o.externalId.trim().slice(0, 256) : undefined;
    return { mode: 'assume-role', roleArn, ...(externalId ? { externalId } : {}) };
  }
  return 'invalid';
}

export async function POST(request: Request, { params }: { params: { cluster: string } }) {
  const user = await verifyUser(request.headers.get('cookie'));
  if (!user) return json({ status: 'error', message: 'unauthenticated' }, 401);
  if (!(await isAdmin(user))) return json({ status: 'error', message: 'admin only' }, 403);
  if (!CLUSTER_NAME_RE.test(params.cluster)) return json({ status: 'error', message: 'invalid cluster name' }, 400);
  // Cluster must actually exist (spec §3.2 ①) — never emit a guide for arbitrary input.
  const known = (await listClusters()).some((c) => c.name === params.cluster);
  if (!known) return json({ status: 'error', message: 'unknown cluster' }, 404);
  // pentest-remediation P0-2: raw request.json() had no size cap (allowlisted here because it's
  // admin-only, but still an unbounded heap buffer). 32KB comfortably covers the 16384-char
  // sa-token cap above plus JSON overhead.
  let rawBody: unknown = null;
  try {
    rawBody = await readJsonBounded(request, 32_768);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ status: 'error', message: 'request body too large' }, 413);
    /* empty/invalid body OK — auth defaults to null (no Aurora-stored auth) */
  }
  const auth = parseAuth(rawBody);
  if (auth === 'invalid') return json({ status: 'error', message: 'invalid auth payload' }, 400);
  // Aurora-stored auth needs NO access entry — register + store in one step.
  if (auth) {
    const ok = await setClusterAuth(params.cluster, user.sub, auth);
    if (!ok) return json({ status: 'error', message: 'registry storage unavailable' }, 503);
    return json({ registered: true, authMode: auth.mode }, 200);
  }
  const entry = await hasAccessEntry(params.cluster);
  if (entry !== true) {
    // No entry (or undeterminable) — hand back the v1-style guide instead of failing opaquely.
    // This check runs BEFORE the env-cluster shortcut (PR #36 r3): a cluster added to tfvars
    // but not yet applied must not get a "registered" 200 it can't honor (incluster would 403).
    // cluster echoed for idempotent-call debugging.
    return json({ registered: false, cluster: params.cluster, access: entry === false ? 'no-entry' : 'unknown', guide: await onboardingGuide(params.cluster) }, 409);
  }
  // Terraform-managed clusters are already permanently allowed — idempotent no-op, no redundant DB row (P4 gate).
  if (isEnvCluster(params.cluster)) return json({ registered: true, managedBy: 'terraform' }, 200);
  const ok = await registerCluster(params.cluster, user.sub);
  if (!ok) return json({ status: 'error', message: 'registry storage unavailable' }, 503);
  return json({ registered: true }, 200);
}

export async function DELETE(request: Request, { params }: { params: { cluster: string } }) {
  const user = await verifyUser(request.headers.get('cookie'));
  if (!user) return json({ status: 'error', message: 'unauthenticated' }, 401);
  if (!(await isAdmin(user))) return json({ status: 'error', message: 'admin only' }, 403);
  // Same charset gate as POST — defense-in-depth consistency (panel r5: gemini).
  if (!CLUSTER_NAME_RE.test(params.cluster)) return json({ status: 'error', message: 'invalid cluster name' }, 400);
  if (isEnvCluster(params.cluster)) {
    return json({ status: 'error', message: 'Terraform(onboard_eks_clusters) 관할 — tfvars에서 제거하세요' }, 400);
  }
  // PR #36 review: not-found(404) vs storage-down(503) must be distinguishable — a DB
  // outage presented as "already unregistered" misleads the operator.
  const result = await unregisterCluster(params.cluster);
  if (result === 'deleted') return json({ unregistered: true }, 200);
  if (result === 'not-found') return json({ status: 'error', message: 'not registered' }, 404);
  return json({ status: 'error', message: '등록 저장소(Aurora)를 사용할 수 없습니다' }, 503);
}
