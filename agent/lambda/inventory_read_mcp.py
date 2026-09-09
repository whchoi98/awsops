"""
Inventory-Read MCP Lambda — Aurora-backed, read-only topology & unused-resource tool.

The v2 equivalent of v1's ops `run_steampipe_query`: instead of querying live Steampipe, it reads
the inventory the Steampipe sync already materialized into Aurora (`inventory_resources` +
`topology_nodes/edges`, ADR-043) and answers topology / unused-resource questions over it. This
reconnects "the topology data we built in Aurora" to AgentCore — the bridge that was missing in v2.

Tools (all read-only — SELECT only; no AWS mutation, no arbitrary SQL):
  - find_unused_resources : orphan TGs, empty CloudFront origins, dead/idle LBs, unattached EBS …
  - query_inventory       : list/filter synced resources by type, including ecs_service
  - get_topology          : topology_nodes/edges graph (nodes+edges, matches /api/graph contract)
  - inventory_summary     : counts by type + sync freshness

Aurora access uses the **RDS Data API** (boto3 `rds-data`, bundled in the Lambda runtime) — no VPC
attachment and no pg8000 packaging needed (the agent Lambdas are zipped from raw .py with no pip
deps). The cluster's HttpEndpoint must be enabled (terraform). DB access is lazy + injectable so the
pure detection logic (detect_unused) is unit-testable with fixtures (no DB, no boto3).

인벤토리-읽기 MCP 람다 — v2의 ops `run_steampipe_query` 등가물. Aurora에 동기화된 토폴로지/인벤토리를
RDS Data API로 읽어 미사용 리소스·토폴로지 질의에 답한다. 전부 읽기 전용(SELECT만).
"""
import json
import os

from cross_account import resolve_tool_name


# ── Resource types the topology/unused detection reads (mirrors graph-store TYPE_TO_KEY) ──────────
TOPOLOGY_TYPES = ["cloudfront", "alb", "nlb", "target_group", "ec2", "ebs", "security_group",
                  "route53", "lambda", "ecs_task", "s3"]

# Coverage note: EIP / ENI / ELB listeners are NOT in the inventory sync yet, so listener-less LBs
# and unattached EIP/ENI are out of scope for the Aurora-backed detector (live-API only).
COVERAGE_NOTE = ("Derived from the synced Aurora inventory (inventory_resources). Elastic IPs, "
                 "detached ENIs, and ELB listeners are not synced yet, so those are out of scope "
                 "here. Freshness = the latest inventory sync; see inventory_summary().")


# ── Pure detection logic (fixture-testable; no DB) ───────────────────────────────────────────────
def _states(tg):
    """Health states of a target_group's registered targets (PascalCase AWS SDK shape)."""
    return [(d.get("TargetHealth") or {}).get("State") for d in (tg.get("target_health_descriptions") or [])]


def detect_unused(by_type):
    """Detect unused/orphaned resources from synced inventory rows.

    `by_type` maps resource_type -> list of the JSONB `data` dicts of inventory_resources.
    Returns a flat list of findings: {category, resource_type, resource_id, name, reason, severity}.
    """
    findings = []
    tgs = by_type.get("target_group") or []
    albs = by_type.get("alb") or []
    nlbs = by_type.get("nlb") or []

    # LB lookup helpers for the CloudFront origin join.
    lb_by_dns = {}
    for lb in albs + nlbs:
        dns = lb.get("dns_name")
        if dns:
            lb_by_dns[dns] = lb
    # Total healthy targets behind each LB ARN (across all its target groups).
    healthy_by_lb_arn = {}
    for tg in tgs:
        healthy = sum(1 for s in _states(tg) if s == "healthy")
        for arn in (tg.get("load_balancer_arns") or []):
            healthy_by_lb_arn[arn] = healthy_by_lb_arn.get(arn, 0) + healthy

    # ── Target groups ──
    for tg in tgs:
        name = tg.get("target_group_name") or tg.get("target_group_arn") or "?"
        rid = tg.get("target_group_arn") or name
        lb_arns = tg.get("load_balancer_arns") or []
        states = _states(tg)
        registered = len(states)
        healthy = sum(1 for s in states if s == "healthy")
        if not lb_arns:
            reason = "Orphan target group: not attached to any load balancer"
            reason += " and 0 registered targets." if registered == 0 else f"; {registered} target(s) registered but no listener routes to it."
            findings.append({"category": "TargetGroup (orphan, no LB)", "resource_type": "TargetGroup",
                             "resource_id": rid, "name": name, "reason": reason, "severity": "high"})
        elif healthy == 0:
            findings.append({"category": "TargetGroup (attached, 0 healthy)", "resource_type": "TargetGroup",
                             "resource_id": rid, "name": name, "severity": "high",
                             "reason": f"Attached to a load balancer but 0 healthy targets ({registered} registered, all unhealthy/unused) — the listener path is dead."})

    # ── CloudFront distributions ──
    for cf in by_type.get("cloudfront") or []:
        cid = cf.get("id") or cf.get("arn") or "?"
        aliases = cf.get("aliases")
        label = cid
        if isinstance(aliases, dict) and aliases.get("Items"):
            label = aliases["Items"][0]
        if not cf.get("enabled", True):
            findings.append({"category": "CloudFront (disabled)", "resource_type": "CloudFront",
                             "resource_id": cid, "name": label, "severity": "medium",
                             "reason": "Distribution is disabled (Enabled=false) — likely abandoned."})
            continue
        for origin in (cf.get("origins") or []):
            domain = origin.get("DomainName") if isinstance(origin, dict) else None
            if domain and domain in lb_by_dns:
                lb = lb_by_dns[domain]
                if healthy_by_lb_arn.get(lb.get("arn"), 0) == 0:
                    findings.append({"category": "CloudFront (empty origin)", "resource_type": "CloudFront",
                                     "resource_id": cid, "name": label, "severity": "high",
                                     "reason": f"Origin points at {lb.get('name')} which has no healthy backend targets — the origin serves nothing (empty/dead chain)."})
                    break

    # ── EBS volumes ──
    for vol in by_type.get("ebs") or []:
        if vol.get("state") == "available":
            vid = vol.get("volume_id") or "?"
            size = vol.get("size")
            findings.append({"category": "EBS volume (unattached)", "resource_type": "EBS",
                             "resource_id": vid, "name": vid, "severity": "high",
                             "reason": f"Volume is 'available' (unattached){f' — {size} GiB' if size else ''} — pure storage cost."})

    return findings


def build_topology_chain(by_type, root=None):
    """Trace CF→LB→TG→target chains from raw inventory rows (legacy chain-builder; topology_nodes/edges is the canonical path)."""
    albs = {lb.get("dns_name"): lb for lb in (by_type.get("alb") or []) + (by_type.get("nlb") or [])}
    tgs_by_lb = {}
    for tg in by_type.get("target_group") or []:
        for arn in (tg.get("load_balancer_arns") or []):
            tgs_by_lb.setdefault(arn, []).append(tg)
    chains = []
    for cf in by_type.get("cloudfront") or []:
        if root and root not in (cf.get("id"), cf.get("domain_name")):
            continue
        for origin in (cf.get("origins") or []):
            domain = origin.get("DomainName") if isinstance(origin, dict) else None
            lb = albs.get(domain) if domain else None  # null domain must not match a null-dns LB
            node = {"cloudfront": cf.get("id"), "origin": domain, "loadBalancer": lb.get("name") if lb else None,
                    "targetGroups": [{"name": t.get("target_group_name"),
                                      "healthy": sum(1 for s in _states(t) if s == "healthy"),
                                      "registered": len(_states(t))}
                                     for t in (tgs_by_lb.get(lb.get("arn"), []) if lb else [])]}
            chains.append(node)
    return chains


def _fetch_topology_graph(resource_id=None, cls="flow", limit=500):
    """Read the materialized topology graph from topology_nodes/edges (ADR-043).

    Matches the /api/graph contract:
      nodes = [{id, kind, label, meta}]
      edges = [{source, target, rel, confidence}]

    If resource_id is given, scopes to that node + its 1-hop neighbourhood (filtered in Python
    after the full-graph fetch so we avoid RDS Data API array-binding complexity).
    JSONB `meta` is returned as a dict by formatRecordsAs=JSON; _parse_meta handles the rare
    string case defensively.
    """
    node_rows = _execute(
        "SELECT id, kind, label, meta FROM topology_nodes "
        "WHERE account_id = 'self' AND class = :cls LIMIT " + str(int(min(limit, 1000))),
        params=[{"name": "cls", "value": {"stringValue": cls}}])
    edge_rows = _execute(
        "SELECT source, target, rel, confidence FROM topology_edges "
        "WHERE account_id = 'self' AND class = :cls",
        params=[{"name": "cls", "value": {"stringValue": cls}}])

    def _parse_meta(m):
        if isinstance(m, dict):
            return m
        if isinstance(m, str) and m:
            try:
                return json.loads(m)
            except Exception:
                return {}
        return {}

    nodes = [{"id": r["id"], "kind": r["kind"], "label": r["label"],
              "meta": _parse_meta(r.get("meta"))} for r in node_rows if r.get("id")]
    edges = [{"source": r["source"], "target": r["target"],
              "rel": r["rel"], "confidence": r["confidence"]}
             for r in edge_rows if r.get("source") and r.get("target")]

    if resource_id:
        neighbor_ids = {resource_id}
        for e in edges:
            if e["source"] == resource_id or e["target"] == resource_id:
                neighbor_ids.add(e["source"])
                neighbor_ids.add(e["target"])
        nodes = [n for n in nodes if n["id"] in neighbor_ids]
        edges = [e for e in edges if e["source"] in neighbor_ids and e["target"] in neighbor_ids]

    return nodes, edges


# ── Aurora access via the RDS Data API (lazy + injectable; boto3 is in the Lambda runtime) ─────────
_execute_override = None  # tests may inject a fake (sql, params) -> [row-dict]


def _execute(sql, params=None):
    """Run read-only SQL through the RDS Data API; return rows as dicts (formatRecordsAs=JSON)."""
    if _execute_override:
        return _execute_override(sql, params)
    import boto3  # lazy: keep pure logic importable without boto3
    client = boto3.client("rds-data", region_name=os.environ.get("AWS_REGION", "ap-northeast-2"))
    kwargs = {
        "resourceArn": os.environ["AURORA_CLUSTER_ARN"],
        "secretArn": os.environ["AURORA_SECRET_ARN"],
        "database": os.environ.get("AURORA_DATABASE", "awsops"),
        "sql": sql,
        "formatRecordsAs": "JSON",
    }
    if params:
        kwargs["parameters"] = params
    resp = client.execute_statement(**kwargs)
    return json.loads(resp.get("formattedRecords") or "[]")


def _coerce(d):
    return d if isinstance(d, dict) else (json.loads(d) if isinstance(d, str) and d else {})


# Per-type field projection: the RDS Data API has a hard 1 MB response cap, and the raw `data`
# JSONB (esp. cloudfront cache_behaviors) is large. So we SELECT only the keys the detector/topology
# logic actually reads — keeping each response well under the cap on large accounts. Keys are
# constants (never user input); the resource_type is always a bound Data API parameter.
PROJECTIONS = {
    "target_group": ["target_group_arn", "target_group_name", "load_balancer_arns", "target_health_descriptions"],
    "alb": ["name", "dns_name", "arn"],
    "nlb": ["name", "dns_name", "arn"],
    # `origins` IS present, but the sql_reader view (migration 01KYVY9J…) projects each element down
    # to `{DomainName}` only — detect_unused()/build_topology_chain() read nothing else off an origin
    # object (grepped). A prior revision dropped the key entirely to keep CustomHeaders[].HeaderValue
    # (an origin secret) out, which silently disabled the "CloudFront (empty origin)" high-severity
    # finding (PR #197 review MAJOR, 3 models). The per-element projection is what actually closes
    # the leak, so the key belongs back on this list.
    "cloudfront": ["id", "domain_name", "enabled", "origins", "aliases"],
    "ebs": ["volume_id", "state", "size", "volume_type"],
}


def _projected_select(rtype):
    """Column expression for a type's inventory payload.

    Reads run as `awsops_sql_reader`, whose sql_reader.inventory_resources view exposes `data` as a
    NAMED-KEY PROJECTION (migration 01KYVY9J…, INVARIANT rule 5) — raw provider payloads are not
    reachable, so any key not on that allowlist comes back absent, not denied. Selecting `data`
    unqualified is therefore safe here AND under the exec role, and asking for a specific key that
    the view drops simply yields null rather than an error.
    """
    keys = PROJECTIONS.get(rtype)
    if not keys:
        return "data"
    pairs = ",".join("'" + k + "', data->'" + k + "'" for k in keys)  # keys are module constants
    return "jsonb_build_object(" + pairs + ")"


def _fetch_by_type(types):
    """Read inventory_resources grouped by resource_type. Returns {type: [data, ...]}.

    `types` are trusted internal constants — restricted to TOPOLOGY_TYPES. One bounded, field-
    projected query per type (1 MB Data API cap), with the type bound as a parameter (never inlined)."""
    out = {}
    for t in [t for t in types if t in set(TOPOLOGY_TYPES)]:
        rows = _execute(
            "SELECT " + _projected_select(t) + " AS data FROM inventory_resources "
            "WHERE account_id = 'self' AND resource_type = :rt",
            params=[{"name": "rt", "value": {"stringValue": t}}])
        out[t] = [_coerce(r.get("data")) for r in rows]
    return out


def _fetch_one_type(rtype, limit):
    """Backs `query_inventory`, the one tool where the model picks `rtype` — so unlike
    `_fetch_by_type` (called only with the fixed TOPOLOGY_TYPES set), this can be asked about a type
    with no PROJECTIONS entry.

    Selecting bare `data` for such a type used to look like it returned the full row, but reads run
    as `awsops_sql_reader`, whose view already limits `data` to the union of every projected key
    across ALL types (PR #197 review MAJOR, codex-L2) — so an unregistered type came back with
    whatever keys happened to overlap by accident, silently incomplete rather than genuinely absent.
    Being explicit about the same projection (harmless — `_projected_select` falls back to bare
    `data` for an unregistered type too, since that is what the view already limits it to either
    way) does not fix the incompleteness by itself; the honesty fix is the `limited` flag the caller
    surfaces so nothing downstream mistakes a partial object for a complete one.
    """
    rows = _execute("SELECT " + _projected_select(rtype) + " AS data FROM inventory_resources "
                    "WHERE account_id = 'self' AND resource_type = :rt LIMIT " + str(int(limit)),
                    params=[{"name": "rt", "value": {"stringValue": rtype}}])
    return [_coerce(r.get("data")) for r in rows]


def _sync_freshness():
    rows = _execute("SELECT resource_type, status, finished_at, row_count FROM inventory_sync_runs "
                    "WHERE account_id = 'self' ORDER BY resource_type")
    return rows


# ── Tool dispatch ─────────────────────────────────────────────────────────────────────────────────
def _ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}


def lambda_handler(event, context):
    """Entry point. Read-only: every tool issues SELECT-only queries against Aurora."""
    params = event if isinstance(event, dict) else json.loads(event)
    tool_name = resolve_tool_name(params, context)
    arguments = params.get("arguments", params)
    if isinstance(arguments, dict):
        arguments.pop("target_account_id", None)  # single-account; accept-and-ignore

    if tool_name in ("find_unused_resources", ""):
        by_type = _fetch_by_type(["target_group", "alb", "nlb", "cloudfront", "ebs"])
        findings = detect_unused(by_type)
        category = arguments.get("category") if isinstance(arguments, dict) else None
        if category:
            findings = [f for f in findings if category.lower() in f["category"].lower()]
        return _ok({"findings": findings, "count": len(findings), "note": COVERAGE_NOTE})

    if tool_name == "get_topology":
        resource_id = arguments.get("resource_id") if isinstance(arguments, dict) else None
        cls = (arguments.get("class") or "flow") if isinstance(arguments, dict) else "flow"
        if cls not in ("flow", "infra", "trace"):
            # Reject unknown class (400) — do NOT silently coerce to 'flow'. The /api/graph BFF returns
            # 400 for the same input; a direct-MCP caller must get an error, not the WRONG layer's data
            # (plan T7b: both read paths reject identically) (M4).
            return {"statusCode": 400, "body": json.dumps(
                {"error": "invalid class: " + str(cls) + " (expected flow|infra|trace)"})}
        nodes, edges = _fetch_topology_graph(resource_id=resource_id, cls=cls)
        result = {"class": cls, "nodes": nodes, "edges": edges,
                  "node_count": len(nodes), "edge_count": len(edges), "note": COVERAGE_NOTE}
        if resource_id:
            result["from"] = resource_id
        if not nodes:
            result["warning"] = ("Graph not materialized yet — run scripts/v2/graph-rebuild.mjs "
                                 "(or the post-sync worker job) to populate topology_nodes/edges.")
        return _ok(result)

    if tool_name == "query_inventory":
        rtype = arguments.get("resource_type") if isinstance(arguments, dict) else None
        if not rtype:
            return {"statusCode": 400, "body": json.dumps({"error": "resource_type required"})}
        try:
            limit = min(int(arguments.get("limit", 200)), 500) if isinstance(arguments, dict) else 200
        except (TypeError, ValueError):
            limit = 200  # a hallucinated non-numeric limit must not 500
        rows = _fetch_one_type(rtype, limit)
        result = {"resource_type": rtype, "count": len(rows), "resources": rows}
        if rtype not in PROJECTIONS:
            # PR #197 review MAJOR: an unregistered type's `resources` entries only carry whatever
            # keys happen to be on SOME other type's projection allowlist — genuinely absent fields
            # read the same as accidentally-omitted ones. Say so, rather than let a model (or a
            # human reading the response) mistake this for the resource's full JSON.
            result["note"] = (
                f"field-level detail for resource_type={rtype!r} is limited by the sql_reader "
                f"view's security boundary (only fields curated for other types may appear, by "
                f"coincidence) — use inventory_summary/find_unused_resources/get_topology, or the "
                f"AWS describe_* tools, for this type's full detail."
            )
        return _ok(result)

    if tool_name == "inventory_summary":
        return _ok({"sync": _sync_freshness(), "note": COVERAGE_NOTE})

    return {"statusCode": 400, "body": json.dumps({"error": "Unknown tool: " + str(tool_name)})}
