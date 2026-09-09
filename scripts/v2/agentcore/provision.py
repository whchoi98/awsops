#!/usr/bin/env python3
"""AWSops v2 P1f — idempotent AgentCore provisioner.

Reads `terraform -chdir=terraform/v2/foundation output -json` -> ensures Runtime,
9 Gateways, the slice Targets, Memory, Code Interpreter exist (list->create/update),
writes ARNs to SSM, prints a diff/no-op report.

  python3 scripts/v2/agentcore/provision.py          # provision (idempotent)
  python3 scripts/v2/agentcore/provision.py --smoke   # provision + invoke runtime via 1 gateway

Run from the repo root (so `terraform -chdir=...` resolves) AFTER `terraform apply`.
"""
import argparse
import copy
import json
import os
import subprocess
import sys
import time

import boto3
from botocore.exceptions import ClientError

import catalog  # same directory

TFDIR = "terraform/v2/foundation"
RUNTIME_NAME = "awsops_v2_agent"                 # underscores only
MEMORY_NAME = "awsops_v2_memory"                 # underscores only
INTERPRETER_NAME = "awsops_v2_code_interpreter"  # underscores only
IMAGE_TAG = os.environ.get("AGENT_IMAGE_TAG", "agent-latest")  # keep in sync with agentcore.mjs push tag

report = []  # (resource, status, detail)


def log(resource, status, detail=""):
    report.append((resource, status, detail))
    print(f"  [{status:8}] {resource}  {detail}")


def tf_outputs():
    raw = subprocess.check_output(["terraform", f"-chdir={TFDIR}", "output", "-json"], text=True)
    data = json.loads(raw)
    if "agentcore" not in data or data["agentcore"]["value"] is None:
        sys.exit("agentcore output is null — set agentcore_enabled=true and `terraform apply` first.")
    return data["agentcore"]["value"]


def _items(resp):
    """AgentCore list APIs are inconsistent on the wrapper key."""
    for k in ("items", "memories", "gateways", "agentRuntimes", "codeInterpreters", "codeInterpreterSummaries"):
        if k in resp:
            return resp[k]
    return []


def _list_all(list_fn, **kwargs):
    """Paginate an AgentCore list_* call (nextToken) and return ALL items."""
    out, token = [], None
    while True:
        resp = list_fn(**{**kwargs, "nextToken": token}) if token else list_fn(**kwargs)
        out.extend(_items(resp))
        token = resp.get("nextToken")
        if not token:
            return out


def gateway_url(gw_id, region):
    return f"https://{gw_id}.gateway.bedrock-agentcore.{region}.amazonaws.com/mcp"


def ensure_gateways(ctrl, ac):
    """9 gateways, idempotent by exact name. Returns {short_key: gateway_id}."""
    existing = {g.get("name"): g.get("gatewayId") for g in _list_all(ctrl.list_gateways)}
    ids = {}
    for key in catalog.GATEWAYS:
        name = f"awsops-v2-{key}-gateway"  # v2-namespaced: isolate from v1 awsops-* in shared accounts
        if name in existing:
            ids[key] = existing[name]
            log(f"gateway:{key}", "EXISTS", name)
            continue
        try:
            resp = ctrl.create_gateway(
                name=name,
                roleArn=ac["role_arn"],
                protocolType="MCP",
                authorizerType="NONE",
                description=catalog.GATEWAY_DESCRIPTIONS.get(key, key),
            )
            ids[key] = resp["gatewayId"]
            log(f"gateway:{key}", "CREATED", name)
        except ClientError as e:
            log(f"gateway:{key}", "ERR", str(e)[:140])
    return ids


def _inject_account(tools):
    """Deep-copy so we never mutate the shared catalog.TARGETS dicts, then add the
    cross-account target_account_id property to each tool's inputSchema."""
    out = []
    for t in tools:
        t = copy.deepcopy(t)
        t.setdefault("inputSchema", {}).setdefault("properties", {}).setdefault("target_account_id", {
            "type": "string",
            "description": "Target AWS account ID for cross-account access (12 digits). Only provide when instructed.",
        })
        out.append(t)
    return out


def tool_fingerprint(tools):
    """Stable serialization of the tool fields THIS code manages (name + description +
    inputSchema), for drift detection.

    PR-review round 9 MAJOR: drift used to be the tool-NAME set only, so an in-place edit that
    kept the name (round 8 removed `secret_arn` from execute_sql's inputSchema) was never
    detected and the deployed gateway kept advertising the old contract.

    Stability matters more than completeness here: the tools are sorted by name and every dict is
    dumped with sort_keys, so an unchanged catalog produces a byte-identical string run after run
    (no spurious drift, no gateway thrash). Only the three fields this provisioner actually sends
    are projected out, so any field the GetGatewayTarget response echoes back that we never set
    (defaults, nulls) is ignored.
    # ponytail: exact compare INSIDE inputSchema. If AgentCore ever starts injecting extra keys
    # into inputSchema itself, this would report drift on every run — idempotent and harmless
    # (update_gateway_target rewrites the same config) but noisy; narrow the projection then.
    """
    return json.dumps(
        sorted(({"name": t.get("name"),
                 "description": t.get("description"),
                 "inputSchema": t.get("inputSchema")} for t in tools),
               key=lambda t: t["name"] or ""),
        sort_keys=True, separators=(",", ":"))


def ensure_targets(ctrl, ac, gw_ids):
    """Slice targets, idempotent by name. update_gateway_target on tool-schema drift."""
    for tname, spec in catalog.TARGETS.items():
        gw_id = gw_ids.get(spec["gateway"])
        if not gw_id:
            log(f"target:{tname}", "ERR", f"gateway {spec['gateway']} missing")
            continue
        lambda_arn = ac["lambda_arns"].get(spec["lambda_key"])
        if not lambda_arn:
            # Flag-gated targets (e.g. notion-mcp when integrations_enabled=false) have no Lambda
            # in the tf output. That is expected, not an error — SKIP so `make agentcore` exits 0.
            log(f"target:{tname}", "SKIP", f"lambda {spec['lambda_key']} not in tf output (flag off?)")
            continue
        tools = _inject_account(spec["tools"])
        cfg = {"mcp": {"lambda": {"lambdaArn": lambda_arn, "toolSchema": {"inlinePayload": tools}}}}
        creds = [{"credentialProviderType": "GATEWAY_IAM_ROLE"}]
        existing = {t.get("name"): t for t in _list_all(ctrl.list_gateway_targets, gatewayIdentifier=gw_id)}
        try:
            if tname in existing:
                tid = existing[tname]["targetId"]
                cur = ctrl.get_gateway_target(gatewayIdentifier=gw_id, targetId=tid)
                cur_tools = cur.get("targetConfiguration", {}).get("mcp", {}).get("lambda", {}).get("toolSchema", {}).get("inlinePayload", [])
                # Drift = the full managed tool definition (name + description + inputSchema), not
                # just the name set — an in-place schema edit keeping the same name re-syncs too.
                if tool_fingerprint(cur_tools) == tool_fingerprint(tools):
                    log(f"target:{tname}", "EXISTS", f"{len(tools)} tools")
                else:
                    ctrl.update_gateway_target(gatewayIdentifier=gw_id, targetId=tid, name=tname,
                                                description=spec["description"], targetConfiguration=cfg,
                                                credentialProviderConfigurations=creds)
                    log(f"target:{tname}", "UPDATED", f"{len(tools)} tools (schema drift)")
            else:
                ctrl.create_gateway_target(gatewayIdentifier=gw_id, name=tname, description=spec["description"],
                                            targetConfiguration=cfg, credentialProviderConfigurations=creds)
                log(f"target:{tname}", "CREATED", f"{len(tools)} tools")
        except ClientError as e:
            log(f"target:{tname}", "ERR", str(e)[:140])


def prune_moved_targets(ctrl, gw_ids):
    """Idempotent reconcile: delete a target that the catalog has MOVED to a different gateway —
    a KNOWN target name still living on a gateway it is no longer assigned to. Prevents the
    split-brain after a catalog gateway reassignment (e.g. prometheus/clickhouse → external-obs),
    where ensure_targets creates the target on its new home but the stale copy lingers on the old
    gateway (exposing a tool the old gateway's prompt no longer documents). Runs AFTER ensure_targets
    so the new target exists before the old one is removed. Targets whose name is NOT in the catalog
    are manual/experimental — never auto-deleted, only logged."""
    desired = {tname: spec["gateway"] for tname, spec in catalog.TARGETS.items()}
    # Snapshot every provisioned gateway's targets once.
    by_gw = {gw_key: _list_all(ctrl.list_gateway_targets, gatewayIdentifier=gw_id)
             for gw_key, gw_id in gw_ids.items()}
    # SAFETY (review #86 M1): a name is safe to prune off an OLD gateway ONLY if it is confirmed
    # live on its DESIRED home gateway. If the new home target wasn't created — flag-OFF (lambda
    # SKIPped) or a create that ERRed (e.g. GW-not-READY ValidationException) — we must NOT delete
    # the last copy, or the tool vanishes from every gateway. Preserve the old copy until the move
    # actually lands (next idempotent run completes it).
    safe = {name for name, home in desired.items()
            if any(t.get("name") == name for t in by_gw.get(home, []))}
    for gw_key, gw_id in gw_ids.items():
        for t in by_gw[gw_key]:
            name = t.get("name")
            home = desired.get(name)
            if home is None:
                log(f"prune:{name}", "KEEP", f"not in catalog (manual?) on {gw_key}")
            elif home != gw_key:
                if name not in safe:
                    log(f"prune:{name}", "KEEP", f"home {home} has no live target yet — keeping {gw_key} copy")
                    continue
                try:
                    ctrl.delete_gateway_target(gatewayIdentifier=gw_id, targetId=t["targetId"])
                    log(f"prune:{name}", "DELETED", f"orphan on {gw_key} (moved → {home})")
                except ClientError as e:
                    log(f"prune:{name}", "ERR", str(e)[:140])


def ensure_memory(ctrl):
    # ListMemories items carry id/arn/status but NOT name; resolve name via get_memory.
    for m in _list_all(ctrl.list_memories):
        mid = m.get("id") or m.get("memoryId")
        if not mid:
            continue
        try:
            detail = ctrl.get_memory(memoryId=mid).get("memory", {})
        except ClientError:
            detail = {}
        if detail.get("name") == MEMORY_NAME:
            log("memory", "EXISTS", mid)
            return mid
    try:
        resp = ctrl.create_memory(name=MEMORY_NAME, description="AWSops v2 conversation history",
                                  eventExpiryDuration=365)
        # CreateMemory returns {"memory": {"id": ...}}.
        mem = resp.get("memory", resp)
        mid = mem.get("id") or mem.get("memoryId")
        log("memory", "CREATED", mid)
        return mid
    except ClientError as e:
        log("memory", "ERR", str(e)[:140])
        return ""


def ensure_interpreter(ctrl):
    for c in _list_all(ctrl.list_code_interpreters):
        if c.get("name") == INTERPRETER_NAME:
            cid = c.get("codeInterpreterId") or c.get("id")
            log("interpreter", "EXISTS", cid)
            return cid
    try:
        resp = ctrl.create_code_interpreter(name=INTERPRETER_NAME,
                                            networkConfiguration={"networkMode": "PUBLIC"})
        cid = resp.get("codeInterpreterId") or resp.get("id")
        log("interpreter", "CREATED", cid)
        return cid
    except ClientError as e:
        log("interpreter", "ERR", str(e)[:140])
        return ""


def ensure_runtime(ctrl, ac, gw_ids):
    region = ac["region"]
    gateways_json = json.dumps({k: gateway_url(v, region) for k, v in gw_ids.items()})
    artifact = {"containerConfiguration": {"containerUri": f"{ac['ecr_uri']}:{IMAGE_TAG}"}}
    # VPC mode when the TF output supplies subnets+SGs (Pattern 2: ENIs in our VPC so agents reach
    # private Aurora/EKS; egress to Bedrock/AgentCore still works via the subnets' NAT). Falls back
    # to PUBLIC otherwise. networkMode/networkModeConfig flip in-place (no interruption).
    subnets = ac.get("subnets") or []
    sgs = ac.get("security_groups") or []
    if subnets and sgs:
        netcfg = {"networkMode": "VPC",
                  "networkModeConfig": {"subnets": subnets, "securityGroups": sgs}}
    else:
        netcfg = {"networkMode": "PUBLIC"}
    # AWSOPS_HOST_ACCOUNT_ID lets agent.account_utils skip the per-cold-start STS
    # GetCallerIdentity lookup (same value cross_account.py uses on the tool
    # Lambdas). Account parsed from the role ARN (arn:aws:iam::<account>:role/...).
    env = {"AWS_REGION": region, "GATEWAYS_JSON": gateways_json,
           "AWSOPS_HOST_ACCOUNT_ID": ac["role_arn"].split(":")[4],
           # Dark-path chat loop (ADR-008 amended / BASELINE §2) — default OFF. Set explicitly on the
           # runtime so it survives re-provisioning and is toggleable via the normal deploy path:
           # `ANTHROPIC_AGENT_LOOP_ENABLED=true make agentcore`.
           "ANTHROPIC_AGENT_LOOP_ENABLED": os.environ.get("ANTHROPIC_AGENT_LOOP_ENABLED", "false")}
    existing = {r.get("agentRuntimeName"): r for r in _list_all(ctrl.list_agent_runtimes)}
    try:
        if RUNTIME_NAME in existing:
            rid = existing[RUNTIME_NAME].get("agentRuntimeId")
            # v1 quirk: update MUST re-pass roleArn + networkConfiguration.
            resp = ctrl.update_agent_runtime(agentRuntimeId=rid, roleArn=ac["role_arn"],
                                             agentRuntimeArtifact=artifact, networkConfiguration=netcfg,
                                             environmentVariables=env)
            arn = resp.get("agentRuntimeArn") or existing[RUNTIME_NAME].get("agentRuntimeArn")
            log("runtime", "UPDATED", arn)
            return arn
        resp = ctrl.create_agent_runtime(agentRuntimeName=RUNTIME_NAME, roleArn=ac["role_arn"],
                                         agentRuntimeArtifact=artifact, networkConfiguration=netcfg,
                                         environmentVariables=env)
        arn = resp.get("agentRuntimeArn")
        log("runtime", "CREATED", arn)
        return arn
    except ClientError as e:
        log("runtime", "ERR", str(e)[:160])
        return ""


def write_ssm(ac, runtime_arn, interpreter_id, memory_id):
    ssm = boto3.client("ssm", region_name=ac["region"])
    for pname, val in [(ac["ssm_runtime_arn"], runtime_arn),
                       (ac["ssm_interpreter_id"], interpreter_id),
                       (ac["ssm_memory_id"], memory_id)]:
        if not val:
            log(f"ssm:{pname}", "SKIP", "empty value")
            continue
        ssm.put_parameter(Name=pname, Value=val, Type="String", Overwrite=True)
        log(f"ssm:{pname}", "WROTE", val[:60])


def smoke(ac, runtime_arn):
    if not runtime_arn:
        log("smoke", "ERR", "no runtime arn")
        return
    data = boto3.client("bedrock-agentcore", region_name=ac["region"])
    payload = json.dumps({"gateway": "security", "prompt": "List the IAM roles in this account. Use the list_roles tool."}).encode()
    try:
        resp = data.invoke_agent_runtime(agentRuntimeArn=runtime_arn, qualifier="DEFAULT",
                                         runtimeSessionId="p1f-smoke-session-000000000000000000000000000000000",
                                         payload=payload)
        body = resp["response"].read().decode() if hasattr(resp.get("response"), "read") else str(resp.get("response"))
        ok = "role" in body.lower()
        log("smoke", "OK" if ok else "WARN", body[:160])
    except ClientError as e:
        log("smoke", "ERR", str(e)[:160])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="invoke the runtime through one gateway after provisioning")
    args = ap.parse_args()

    ac = tf_outputs()
    region = ac["region"]
    ctrl = boto3.client("bedrock-agentcore-control", region_name=region)

    print(f"\n=== AWSops v2 AgentCore provisioner (region={region}) ===")
    gw_ids = ensure_gateways(ctrl, ac)
    ensure_targets(ctrl, ac, gw_ids)
    prune_moved_targets(ctrl, gw_ids)  # remove split-brain orphans after a catalog gateway move
    memory_id = ensure_memory(ctrl)
    interpreter_id = ensure_interpreter(ctrl)
    runtime_arn = ensure_runtime(ctrl, ac, gw_ids)
    write_ssm(ac, runtime_arn, interpreter_id, memory_id)

    if args.smoke:
        print("\n=== smoke (runtime -> gateway -> tool) ===")
        # the runtime may need a few seconds after create/update to become invokable
        time.sleep(10)
        smoke(ac, runtime_arn)

    errs = [r for r in report if r[1] == "ERR"]
    print(f"\n=== report: {len(report)} actions, {len(errs)} errors ===")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
