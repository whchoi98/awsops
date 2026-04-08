"""
Datasource Connectivity Diagnostics MCP Lambda
데이터소스 연결 진단 MCP Lambda

Provides 8 diagnostic tools for troubleshooting datasource connectivity:
URL validation, DNS resolution, NLB targets, SG analysis, network path tracing,
HTTP connectivity, K8s service endpoints, and full orchestrated diagnosis.

데이터소스 연결 트러블슈팅을 위한 8개 진단 도구 제공:
URL 검증, DNS 해석, NLB 타겟, SG 분석, 네트워크 경로 추적,
HTTP 연결, K8s 서비스 엔드포인트, 전체 오케스트레이션 진단.
"""
import json
import socket
import time
import ipaddress
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from cross_account import get_client, get_role_arn


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    target_account_id = args.pop('target_account_id', None)
    role_arn = get_role_arn(target_account_id) if target_account_id else None
    region = args.get("region", "ap-northeast-2")

    if not t:
        if "url" in params and "datasource_type" in params:
            t = "validate_datasource_url"
        elif "hostname" in params:
            t = "resolve_dns"
        elif "nlb_dns" in params or "nlb_arn" in params:
            t = "check_nlb_targets"
        elif "source_cidr" in params:
            t = "analyze_security_groups"
        elif "source_vpc_id" in params and "destination_vpc_id" in params:
            t = "trace_network_path"
        elif "url" in params:
            t = "test_http_connectivity"
        elif "cluster_name" in params and "service_name" in params:
            t = "check_k8s_service_endpoints"
        else:
            t = "run_full_diagnosis"
        args = params

    try:
        # ========== Tool 1: URL Validation / URL 검증 ==========
        if t == "validate_datasource_url":
            return _validate_datasource_url(args)

        # ========== Tool 2: DNS Resolution / DNS 해석 ==========
        elif t == "resolve_dns":
            return _resolve_dns(args, region, role_arn)

        # ========== Tool 3: NLB Target Health / NLB 타겟 헬스 ==========
        elif t == "check_nlb_targets":
            return _check_nlb_targets(args, region, role_arn)

        # ========== Tool 4: Security Group Analysis / SG 분석 ==========
        elif t == "analyze_security_groups":
            return _analyze_security_groups(args, region, role_arn)

        # ========== Tool 5: Network Path Trace / 네트워크 경로 추적 ==========
        elif t == "trace_network_path":
            return _trace_network_path(args, region, role_arn)

        # ========== Tool 6: HTTP Connectivity Test / HTTP 연결 테스트 ==========
        elif t == "test_http_connectivity":
            return _test_http_connectivity(args)

        # ========== Tool 7: K8s Service Endpoints / K8s 서비스 엔드포인트 ==========
        elif t == "check_k8s_service_endpoints":
            return _check_k8s_service_endpoints(args, region, role_arn)

        # ========== Tool 8: Full Diagnosis / 전체 진단 ==========
        elif t == "run_full_diagnosis":
            return _run_full_diagnosis(args, region, role_arn)

        return err("Unknown tool: " + t)

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


# ============================================================================
# Tool Implementations / 도구 구현
# ============================================================================

def _validate_datasource_url(args):
    """Validate datasource URL structure, protocol, SSRF risk.
    데이터소스 URL 구조, 프로토콜, SSRF 위험을 검증."""
    url = args.get("url", "").strip()
    ds_type = args.get("datasource_type", "unknown").lower()

    if not url:
        return err("url is required")

    try:
        parsed = urlparse(url)
    except Exception as e:
        return ok({"valid": False, "error": f"URL parse error: {e}"})

    scheme = parsed.scheme or ""
    hostname = parsed.hostname or ""
    port = parsed.port
    path = parsed.path or ""

    # Detect NLB DNS pattern / NLB DNS 패턴 감지
    is_nlb_dns = ".elb." in hostname and ".amazonaws.com" in hostname
    is_alb_dns = ".elb." in hostname and ".amazonaws.com" in hostname and hostname.startswith("k8s-")

    # Check if hostname resolves to private IP / 사설 IP 여부 확인
    is_private_ip = False
    try:
        ip = ipaddress.ip_address(hostname)
        is_private_ip = ip.is_private
    except ValueError:
        pass  # hostname, not IP

    # SSRF risk assessment / SSRF 위험 평가
    ssrf_risk = "none"
    blocked_patterns = ["169.254.169.254", "metadata.google", "localhost", "127.0.0.1", "::1", "0.0.0.0"]
    if any(p in hostname.lower() for p in blocked_patterns):
        ssrf_risk = "blocked"
    elif is_private_ip or is_nlb_dns:
        ssrf_risk = "requires_allowlist"

    # Health endpoint by datasource type / 데이터소스 유형별 헬스 엔드포인트
    health_endpoints = {
        "prometheus": "/-/healthy",
        "loki": "/ready",
        "tempo": "/ready",
        "clickhouse": "/ping",
        "grafana": "/api/health",
        "elasticsearch": "/_cluster/health",
        "opensearch": "/_cluster/health",
    }
    health_endpoint = health_endpoints.get(ds_type, "/")

    return ok({
        "valid": bool(scheme and hostname),
        "scheme": scheme,
        "hostname": hostname,
        "port": port,
        "path": path,
        "is_private_ip": is_private_ip,
        "is_nlb_dns": is_nlb_dns,
        "is_alb_dns": is_alb_dns,
        "is_internal_domain": is_private_ip or is_nlb_dns,
        "ssrf_risk": ssrf_risk,
        "health_endpoint": health_endpoint,
        "datasource_type": ds_type,
    })


def _resolve_dns(args, region, role_arn):
    """Resolve hostname to IPs, map to VPC CIDRs, detect NLB.
    호스트명을 IP로 해석하고 VPC CIDR에 매핑, NLB 감지."""
    hostname = args.get("hostname", "").strip()
    if not hostname:
        return err("hostname is required")

    # DNS resolution / DNS 해석
    start = time.time()
    try:
        results = socket.getaddrinfo(hostname, None, socket.AF_INET)
        resolved_ips = list(set(r[4][0] for r in results))
    except socket.gaierror as e:
        return ok({
            "hostname": hostname,
            "resolved": False,
            "error": f"DNS resolution failed: {e}",
            "dns_resolution_time_ms": int((time.time() - start) * 1000),
        })
    dns_time = int((time.time() - start) * 1000)

    # Check if IPs are private / IP가 사설인지 확인
    all_private = all(_is_private_ip(ip) for ip in resolved_ips)

    # Map resolved IPs to VPCs / 해석된 IP를 VPC에 매핑
    matching_vpcs = []
    if all_private:
        try:
            ec2 = get_client('ec2', region, role_arn)
            vpcs = ec2.describe_vpcs().get("Vpcs", [])
            for vpc in vpcs:
                cidr = vpc.get("CidrBlock", "")
                name = _get_tag(vpc, "Name")
                try:
                    network = ipaddress.ip_network(cidr, strict=False)
                    for ip in resolved_ips:
                        if ipaddress.ip_address(ip) in network:
                            matching_vpcs.append({
                                "vpc_id": vpc["VpcId"],
                                "cidr": cidr,
                                "name": name,
                            })
                            break
                except ValueError:
                    continue
        except Exception as e:
            matching_vpcs = [{"error": str(e)}]

    return ok({
        "hostname": hostname,
        "resolved": True,
        "resolved_ips": resolved_ips,
        "is_private": all_private,
        "matching_vpcs": matching_vpcs,
        "dns_resolution_time_ms": dns_time,
    })


def _check_nlb_targets(args, region, role_arn):
    """Check NLB target groups and target health.
    NLB 타겟 그룹 및 타겟 헬스 확인."""
    nlb_dns = args.get("nlb_dns", "").strip()
    nlb_arn = args.get("nlb_arn", "").strip()
    port = args.get("port", 0)

    if not nlb_dns and not nlb_arn:
        return err("nlb_dns or nlb_arn is required")

    elbv2 = get_client('elbv2', region, role_arn)

    # Find NLB by DNS or ARN / DNS 또는 ARN으로 NLB 검색
    try:
        if nlb_arn:
            lbs = elbv2.describe_load_balancers(LoadBalancerArns=[nlb_arn])["LoadBalancers"]
        else:
            # Search all NLBs for matching DNS / 모든 NLB에서 DNS 매칭 검색
            lbs = elbv2.describe_load_balancers()["LoadBalancers"]
            lbs = [lb for lb in lbs if lb.get("DNSName", "") in nlb_dns or nlb_dns in lb.get("DNSName", "")]
    except Exception as e:
        return ok({"error": f"Failed to find NLB: {e}", "nlb_dns": nlb_dns})

    if not lbs:
        return ok({"found": False, "nlb_dns": nlb_dns, "message": "NLB not found"})

    lb = lbs[0]
    lb_arn = lb["LoadBalancerArn"]

    # Get target groups / 타겟 그룹 조회
    tgs = elbv2.describe_target_groups(LoadBalancerArn=lb_arn)["TargetGroups"]
    target_groups = []

    for tg in tgs:
        tg_arn = tg["TargetGroupArn"]
        # Filter by port if specified / 포트 지정 시 필터
        if port and tg.get("Port") != port:
            continue

        # Get target health / 타겟 헬스 조회
        health = elbv2.describe_target_health(TargetGroupArn=tg_arn)
        targets = []
        healthy_count = 0
        unhealthy_count = 0

        for th in health.get("TargetHealthDescriptions", []):
            state = th.get("TargetHealth", {}).get("State", "unknown")
            if state == "healthy":
                healthy_count += 1
            else:
                unhealthy_count += 1
            targets.append({
                "id": th.get("Target", {}).get("Id", ""),
                "port": th.get("Target", {}).get("Port"),
                "health": state,
                "reason": th.get("TargetHealth", {}).get("Reason"),
                "description": th.get("TargetHealth", {}).get("Description", ""),
            })

        target_groups.append({
            "arn": tg_arn,
            "name": tg.get("TargetGroupName", ""),
            "port": tg.get("Port"),
            "target_type": tg.get("TargetType", ""),
            "protocol": tg.get("Protocol", ""),
            "health_check": {
                "protocol": tg.get("HealthCheckProtocol", ""),
                "port": tg.get("HealthCheckPort", ""),
                "path": tg.get("HealthCheckPath", ""),
                "interval": tg.get("HealthCheckIntervalSeconds"),
            },
            "targets": targets,
            "healthy_count": healthy_count,
            "unhealthy_count": unhealthy_count,
        })

    return ok({
        "nlb": {
            "arn": lb_arn,
            "name": lb.get("LoadBalancerName", ""),
            "dns": lb.get("DNSName", ""),
            "vpc_id": lb.get("VpcId", ""),
            "scheme": lb.get("Scheme", ""),
            "state": lb.get("State", {}).get("Code", ""),
            "type": lb.get("Type", ""),
        },
        "target_groups": target_groups,
    })


def _analyze_security_groups(args, region, role_arn):
    """Analyze SG chain for source CIDR → destination IP:port.
    소스 CIDR → 목적지 IP:포트에 대한 SG 체인 분석."""
    source_cidr = args.get("source_cidr", "")
    dest_ip = args.get("destination_ip", "")
    port = args.get("port", 0)
    protocol = args.get("protocol", "tcp")

    if not dest_ip or not port:
        return err("destination_ip and port are required")

    ec2 = get_client('ec2', region, role_arn)

    # Find ENIs associated with the destination IP / 목적지 IP에 연관된 ENI 검색
    enis = ec2.describe_network_interfaces(
        Filters=[{"Name": "addresses.private-ip-address", "Values": [dest_ip]}]
    ).get("NetworkInterfaces", [])

    if not enis:
        return ok({
            "destination_ip": dest_ip,
            "port": port,
            "found_eni": False,
            "message": f"No ENI found for IP {dest_ip}",
        })

    eni = enis[0]
    sg_ids = [g["GroupId"] for g in eni.get("Groups", [])]

    # Analyze each SG / 각 SG 분석
    sg_analysis = []
    overall_allowed = False

    for sg_id in sg_ids:
        sg = ec2.describe_security_groups(GroupIds=[sg_id])["SecurityGroups"][0]
        port_allowed = False
        matching_rule = None

        for rule in sg.get("IpPermissions", []):
            rule_proto = rule.get("IpProtocol", "")
            from_port = rule.get("FromPort", 0)
            to_port = rule.get("ToPort", 0)

            # Check protocol match (-1 = all) / 프로토콜 매칭 확인
            if rule_proto != "-1" and rule_proto != protocol:
                continue

            # Check port match / 포트 매칭 확인
            if rule_proto != "-1" and not (from_port <= port <= to_port):
                continue

            # Check source CIDR match / 소스 CIDR 매칭 확인
            for ip_range in rule.get("IpRanges", []):
                cidr = ip_range.get("CidrIp", "")
                if _cidr_contains(cidr, source_cidr):
                    port_allowed = True
                    matching_rule = {
                        "protocol": rule_proto,
                        "from_port": from_port,
                        "to_port": to_port,
                        "source": cidr,
                    }
                    break

            # Check SG references / SG 참조 확인
            if not port_allowed:
                for sg_ref in rule.get("UserIdGroupPairs", []):
                    port_allowed = True
                    matching_rule = {
                        "protocol": rule_proto,
                        "from_port": from_port,
                        "to_port": to_port,
                        "source_sg": sg_ref.get("GroupId", ""),
                    }
                    break

            if port_allowed:
                break

        if port_allowed:
            overall_allowed = True

        sg_entry = {
            "sg_id": sg_id,
            "sg_name": sg.get("GroupName", ""),
            f"port_{port}_allowed": port_allowed,
        }
        if matching_rule:
            sg_entry["matching_rule"] = matching_rule
        if not port_allowed and source_cidr:
            sg_entry["suggestion"] = f"Add inbound rule: {protocol.upper()} {port} from {source_cidr}"

        sg_analysis.append(sg_entry)

    return ok({
        "source_cidr": source_cidr,
        "destination_ip": dest_ip,
        "port": port,
        "destination_eni": {
            "eni_id": eni["NetworkInterfaceId"],
            "vpc_id": eni.get("VpcId", ""),
            "subnet_id": eni.get("SubnetId", ""),
            "sg_ids": sg_ids,
            "description": eni.get("Description", "")[:100],
        },
        "sg_analysis": sg_analysis,
        "overall_allowed": overall_allowed,
    })


def _trace_network_path(args, region, role_arn):
    """Trace network path between source and destination VPCs.
    소스/목적지 VPC 간 네트워크 경로 추적."""
    src_vpc = args.get("source_vpc_id", "")
    dst_vpc = args.get("destination_vpc_id", "")
    dst_ip = args.get("destination_ip", "")
    dst_port = args.get("destination_port", 0)

    if not src_vpc or not dst_vpc:
        return err("source_vpc_id and destination_vpc_id are required")

    ec2 = get_client('ec2', region, role_arn)

    # Same VPC? / 같은 VPC?
    if src_vpc == dst_vpc:
        return ok({
            "same_vpc": True,
            "connectivity_type": "direct",
            "source_vpc_id": src_vpc,
            "destination_vpc_id": dst_vpc,
            "path_status": "connected",
            "message": "Same VPC — direct routing via local route",
        })

    # Check for TGW attachments / TGW 어태치먼트 확인
    result = {
        "same_vpc": False,
        "source_vpc_id": src_vpc,
        "destination_vpc_id": dst_vpc,
        "connectivity_type": "none",
        "path_status": "disconnected",
    }

    # Find TGW attachments for both VPCs / 양 VPC의 TGW 어태치먼트 검색
    try:
        src_attachments = ec2.describe_transit_gateway_attachments(
            Filters=[{"Name": "resource-id", "Values": [src_vpc]}, {"Name": "resource-type", "Values": ["vpc"]}]
        ).get("TransitGatewayAttachments", [])

        dst_attachments = ec2.describe_transit_gateway_attachments(
            Filters=[{"Name": "resource-id", "Values": [dst_vpc]}, {"Name": "resource-type", "Values": ["vpc"]}]
        ).get("TransitGatewayAttachments", [])
    except Exception:
        src_attachments = []
        dst_attachments = []

    # Check VPC peering / VPC 피어링 확인
    try:
        peerings = ec2.describe_vpc_peering_connections(
            Filters=[{"Name": "status-code", "Values": ["active"]}]
        ).get("VpcPeeringConnections", [])
        for p in peerings:
            req = p.get("RequesterVpcInfo", {}).get("VpcId", "")
            acc = p.get("AccepterVpcInfo", {}).get("VpcId", "")
            if (req == src_vpc and acc == dst_vpc) or (req == dst_vpc and acc == src_vpc):
                result["connectivity_type"] = "peering"
                result["peering"] = {"id": p["VpcPeeringConnectionId"], "state": "active"}
                result["path_status"] = "connected"
                return ok(result)
    except Exception:
        pass

    # Match TGW between source and destination / 소스-목적지 간 TGW 매칭
    src_tgw_map = {a["TransitGatewayId"]: a for a in src_attachments if a.get("State") == "available"}
    dst_tgw_map = {a["TransitGatewayId"]: a for a in dst_attachments if a.get("State") == "available"}
    common_tgws = set(src_tgw_map.keys()) & set(dst_tgw_map.keys())

    if not common_tgws:
        result["message"] = "No common Transit Gateway found between VPCs"
        return ok(result)

    tgw_id = list(common_tgws)[0]
    src_attach = src_tgw_map[tgw_id]
    dst_attach = dst_tgw_map[tgw_id]

    result["connectivity_type"] = "transit-gateway"
    result["tgw"] = {"id": tgw_id}
    result["source_attachment"] = {
        "id": src_attach["TransitGatewayAttachmentId"],
        "state": src_attach.get("State", ""),
    }
    result["destination_attachment"] = {
        "id": dst_attach["TransitGatewayAttachmentId"],
        "state": dst_attach.get("State", ""),
    }

    # Check route tables / 라우트 테이블 확인
    route_analysis = {}

    # Source VPC route table → check for destination CIDR via TGW
    # 소스 VPC 라우트 테이블 → TGW 경유 목적지 CIDR 확인
    try:
        dst_vpc_info = ec2.describe_vpcs(VpcIds=[dst_vpc])["Vpcs"][0]
        dst_cidr = dst_vpc_info.get("CidrBlock", "")

        src_rts = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": [src_vpc]}])["RouteTables"]
        src_has_route = False
        for rt in src_rts:
            for r in rt.get("Routes", []):
                if r.get("TransitGatewayId") == tgw_id:
                    dest = r.get("DestinationCidrBlock", "")
                    if dest and dst_ip and _cidr_contains(dest, dst_ip):
                        src_has_route = True
                        route_analysis["source_rt_destination"] = dest
                        route_analysis["source_rt_target"] = tgw_id
                        break
                    elif dest and dst_cidr and _cidr_contains(dest, dst_cidr.split("/")[0]):
                        src_has_route = True
                        route_analysis["source_rt_destination"] = dest
                        route_analysis["source_rt_target"] = tgw_id
                        break
        route_analysis["source_rt_has_route"] = src_has_route

        # Destination VPC return route / 목적지 VPC 리턴 라우트
        src_vpc_info = ec2.describe_vpcs(VpcIds=[src_vpc])["Vpcs"][0]
        src_cidr = src_vpc_info.get("CidrBlock", "")

        dst_rts = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": [dst_vpc]}])["RouteTables"]
        dst_has_route = False
        for rt in dst_rts:
            for r in rt.get("Routes", []):
                if r.get("TransitGatewayId") == tgw_id:
                    dest = r.get("DestinationCidrBlock", "")
                    if dest and src_cidr and _cidr_contains(dest, src_cidr.split("/")[0]):
                        dst_has_route = True
                        route_analysis["dest_rt_destination"] = dest
                        route_analysis["dest_rt_target"] = tgw_id
                        break
        route_analysis["dest_rt_has_route"] = dst_has_route
    except Exception as e:
        route_analysis["error"] = str(e)

    # Check TGW route table / TGW 라우트 테이블 확인
    try:
        tgw_rts = ec2.describe_transit_gateway_route_tables(
            Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}]
        )["TransitGatewayRouteTables"]
        tgw_has_route = False
        for trt in tgw_rts:
            routes = ec2.search_transit_gateway_routes(
                TransitGatewayRouteTableId=trt["TransitGatewayRouteTableId"],
                Filters=[{"Name": "state", "Values": ["active"]}]
            )["Routes"]
            for r in routes:
                if r.get("DestinationCidrBlock") and dst_ip:
                    if _cidr_contains(r["DestinationCidrBlock"], dst_ip):
                        tgw_has_route = True
                        break
        route_analysis["tgw_rt_has_route"] = tgw_has_route
    except Exception as e:
        route_analysis["tgw_error"] = str(e)

    result["route_analysis"] = route_analysis

    # Determine path status / 경로 상태 결정
    src_ok = route_analysis.get("source_rt_has_route", False)
    dst_ok = route_analysis.get("dest_rt_has_route", False)
    tgw_ok = route_analysis.get("tgw_rt_has_route", False)
    if src_ok and dst_ok and tgw_ok:
        result["path_status"] = "connected"
    elif src_ok or dst_ok or tgw_ok:
        result["path_status"] = "partial"
        missing = []
        if not src_ok:
            missing.append("source VPC route to TGW")
        if not dst_ok:
            missing.append("destination VPC return route via TGW")
        if not tgw_ok:
            missing.append("TGW route to destination")
        result["missing"] = missing
    else:
        result["path_status"] = "disconnected"

    return ok(result)


def _test_http_connectivity(args):
    """Test HTTP connectivity to a URL.
    URL에 대한 HTTP 연결 테스트."""
    url = args.get("url", "").strip()
    timeout = args.get("timeout_seconds", 10)
    headers = args.get("headers", {})

    if not url:
        return err("url is required")

    start = time.time()
    try:
        req = Request(url, headers=headers or {})
        req.add_header("User-Agent", "AWSops-Diagnostics/1.0")
        resp = urlopen(req, timeout=timeout)
        latency = int((time.time() - start) * 1000)
        body = resp.read(1024).decode("utf-8", errors="replace")
        return ok({
            "reachable": True,
            "url": url,
            "status_code": resp.getcode(),
            "latency_ms": latency,
            "response_body": body[:500],
            "headers": dict(resp.headers.items())[:10] if resp.headers else {},
            "error": None,
        })
    except HTTPError as e:
        latency = int((time.time() - start) * 1000)
        return ok({
            "reachable": True,
            "url": url,
            "status_code": e.code,
            "latency_ms": latency,
            "response_body": str(e.reason),
            "error": f"HTTP {e.code}: {e.reason}",
        })
    except URLError as e:
        latency = int((time.time() - start) * 1000)
        return ok({
            "reachable": False,
            "url": url,
            "status_code": None,
            "latency_ms": latency,
            "error": str(e.reason),
        })
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return ok({
            "reachable": False,
            "url": url,
            "status_code": None,
            "latency_ms": latency,
            "error": str(e),
        })


def _check_k8s_service_endpoints(args, region, role_arn):
    """Check K8s Service endpoints and matching Pods via EKS API.
    EKS API를 통해 K8s Service 엔드포인트 및 매칭 Pod 확인."""
    cluster_name = args.get("cluster_name", "")
    namespace = args.get("namespace", "default")
    service_name = args.get("service_name", "")

    if not cluster_name or not service_name:
        return err("cluster_name and service_name are required")

    eks = get_client('eks', region, role_arn)

    try:
        # Get cluster endpoint and CA / 클러스터 엔드포인트 및 CA 조회
        cluster = eks.describe_cluster(name=cluster_name)["cluster"]
        endpoint = cluster.get("endpoint", "")
        ca_data = cluster.get("certificateAuthority", {}).get("data", "")

        if not endpoint:
            return ok({"cluster_name": cluster_name, "error": "Cluster endpoint not available"})

        # Get bearer token via STS / STS를 통해 베어러 토큰 획득
        import base64
        import datetime
        from botocore.signers import RequestSigner

        sts = get_client('sts', region, role_arn)
        service_id = sts.meta.service_model.service_id

        signer = RequestSigner(service_id, region, 'sts', 'v4',
                               sts._request_signer._credentials,
                               sts._request_signer._event_emitter)

        params = {
            'method': 'GET',
            'url': f'https://sts.{region}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15',
            'body': {},
            'headers': {'x-k8s-aws-id': cluster_name},
            'context': {}
        }
        signed_url = signer.generate_presigned_url(params, region_name=region, expires_in=60,
                                                    operation_name='')
        token = 'k8s-aws-v1.' + base64.urlsafe_b64encode(signed_url.encode('utf-8')).rstrip(b'=').decode('utf-8')

        # Query K8s API for Service / K8s API로 Service 조회
        import ssl
        import tempfile

        ca_cert_data = base64.b64decode(ca_data)
        ca_file = tempfile.NamedTemporaryFile(delete=False, suffix='.crt')
        ca_file.write(ca_cert_data)
        ca_file.close()

        ctx = ssl.create_default_context(cafile=ca_file.name)

        # Get Service / 서비스 조회
        svc_url = f"{endpoint}/api/v1/namespaces/{namespace}/services/{service_name}"
        req = Request(svc_url, headers={"Authorization": f"Bearer {token}"})
        resp = urlopen(req, timeout=10, context=ctx)
        svc = json.loads(resp.read())

        # Get Endpoints / 엔드포인트 조회
        ep_url = f"{endpoint}/api/v1/namespaces/{namespace}/endpoints/{service_name}"
        req = Request(ep_url, headers={"Authorization": f"Bearer {token}"})
        resp = urlopen(req, timeout=10, context=ctx)
        ep = json.loads(resp.read())

        # Parse service info / 서비스 정보 파싱
        svc_type = svc.get("spec", {}).get("type", "")
        selector = svc.get("spec", {}).get("selector", {})
        ports = svc.get("spec", {}).get("ports", [])
        annotations = svc.get("metadata", {}).get("annotations", {})
        lb_annotation = annotations.get("service.beta.kubernetes.io/aws-load-balancer-type", "")

        # Parse endpoints / 엔드포인트 파싱
        addresses = []
        for subset in ep.get("subsets", []):
            for addr in subset.get("addresses", []):
                for p in subset.get("ports", []):
                    addresses.append({
                        "ip": addr.get("ip", ""),
                        "port": p.get("port"),
                        "ready": True,
                        "target_ref": addr.get("targetRef", {}).get("name", ""),
                    })
            for addr in subset.get("notReadyAddresses", []):
                for p in subset.get("ports", []):
                    addresses.append({
                        "ip": addr.get("ip", ""),
                        "port": p.get("port"),
                        "ready": False,
                        "target_ref": addr.get("targetRef", {}).get("name", ""),
                    })

        # Cleanup temp file / 임시 파일 정리
        import os
        os.unlink(ca_file.name)

        return ok({
            "cluster_name": cluster_name,
            "service": {
                "name": service_name,
                "namespace": namespace,
                "type": svc_type,
                "selector": selector,
                "ports": [{"name": p.get("name"), "port": p.get("port"), "target_port": p.get("targetPort"), "protocol": p.get("protocol")} for p in ports],
            },
            "lb_annotation": lb_annotation,
            "endpoints": addresses,
            "endpoint_count": len(addresses),
            "ready_count": sum(1 for a in addresses if a["ready"]),
        })

    except Exception as e:
        return ok({
            "cluster_name": cluster_name,
            "service_name": service_name,
            "error": str(e),
        })


def _run_full_diagnosis(args, region, role_arn):
    """Run full diagnostic workflow: URL → DNS → NLB → SG → Path → HTTP.
    전체 진단 워크플로우 실행: URL → DNS → NLB → SG → 경로 → HTTP."""
    url = args.get("url", "").strip()
    ds_type = args.get("datasource_type", "unknown")
    source_vpc_id = args.get("source_vpc_id", "")

    if not url:
        return err("url is required")

    steps = []
    overall_status = "pass"

    # Step 1: Validate URL / URL 검증
    step1 = _validate_datasource_url({"url": url, "datasource_type": ds_type})
    step1_body = json.loads(step1["body"]) if isinstance(step1.get("body"), str) else step1.get("body", {})
    steps.append({"step": 1, "name": "validate_url", "status": "pass" if step1_body.get("valid") else "fail", "result": step1_body})

    if not step1_body.get("valid"):
        overall_status = "fail"
        return ok({"steps": steps, "overall_status": overall_status, "summary": "URL validation failed"})

    hostname = step1_body.get("hostname", "")
    port = step1_body.get("port", 80)
    health_endpoint = step1_body.get("health_endpoint", "/")
    is_nlb = step1_body.get("is_nlb_dns", False)

    # Step 2: DNS Resolution / DNS 해석
    step2 = _resolve_dns({"hostname": hostname}, region, role_arn)
    step2_body = json.loads(step2["body"]) if isinstance(step2.get("body"), str) else step2.get("body", {})
    dns_ok = step2_body.get("resolved", False)
    steps.append({"step": 2, "name": "resolve_dns", "status": "pass" if dns_ok else "fail", "result": step2_body})

    if not dns_ok:
        overall_status = "fail"
        return ok({"steps": steps, "overall_status": overall_status, "summary": "DNS resolution failed"})

    resolved_ips = step2_body.get("resolved_ips", [])
    matching_vpcs = step2_body.get("matching_vpcs", [])
    dest_vpc_id = matching_vpcs[0]["vpc_id"] if matching_vpcs else ""

    # Step 3: NLB Target Health (if NLB) / NLB 타겟 헬스 (NLB인 경우)
    if is_nlb:
        step3 = _check_nlb_targets({"nlb_dns": hostname, "port": port}, region, role_arn)
        step3_body = json.loads(step3["body"]) if isinstance(step3.get("body"), str) else step3.get("body", {})
        nlb_ok = step3_body.get("nlb", {}).get("state") == "active"
        tg_ok = all(
            tg.get("healthy_count", 0) > 0
            for tg in step3_body.get("target_groups", [])
        )
        step_status = "pass" if (nlb_ok and tg_ok) else ("warn" if nlb_ok else "fail")
        if step_status != "pass":
            overall_status = step_status
        steps.append({"step": 3, "name": "check_nlb_targets", "status": step_status, "result": step3_body})
    else:
        steps.append({"step": 3, "name": "check_nlb_targets", "status": "skip", "result": {"message": "Not an NLB endpoint"}})

    # Step 4: Security Group Analysis / SG 분석
    if resolved_ips and source_vpc_id:
        # Get source VPC CIDR / 소스 VPC CIDR 조회
        try:
            ec2 = get_client('ec2', region, role_arn)
            src_vpc_info = ec2.describe_vpcs(VpcIds=[source_vpc_id])["Vpcs"][0]
            source_cidr = src_vpc_info.get("CidrBlock", "")
        except Exception:
            source_cidr = ""

        step4 = _analyze_security_groups(
            {"source_cidr": source_cidr, "destination_ip": resolved_ips[0], "port": port},
            region, role_arn
        )
        step4_body = json.loads(step4["body"]) if isinstance(step4.get("body"), str) else step4.get("body", {})
        sg_ok = step4_body.get("overall_allowed", False)
        step_status = "pass" if sg_ok else "fail"
        if step_status == "fail":
            overall_status = "fail"
        steps.append({"step": 4, "name": "analyze_security_groups", "status": step_status, "result": step4_body})
    else:
        steps.append({"step": 4, "name": "analyze_security_groups", "status": "skip",
                       "result": {"message": "source_vpc_id not provided or no resolved IPs"}})

    # Step 5: Network Path (if cross-VPC) / 네트워크 경로 (크로스 VPC인 경우)
    if source_vpc_id and dest_vpc_id and source_vpc_id != dest_vpc_id:
        step5 = _trace_network_path(
            {"source_vpc_id": source_vpc_id, "destination_vpc_id": dest_vpc_id,
             "destination_ip": resolved_ips[0] if resolved_ips else "", "destination_port": port},
            region, role_arn
        )
        step5_body = json.loads(step5["body"]) if isinstance(step5.get("body"), str) else step5.get("body", {})
        path_ok = step5_body.get("path_status") == "connected"
        step_status = "pass" if path_ok else ("warn" if step5_body.get("path_status") == "partial" else "fail")
        if step_status == "fail":
            overall_status = "fail"
        elif step_status == "warn" and overall_status == "pass":
            overall_status = "warn"
        steps.append({"step": 5, "name": "trace_network_path", "status": step_status, "result": step5_body})
    else:
        steps.append({"step": 5, "name": "trace_network_path", "status": "skip",
                       "result": {"message": "Same VPC or source_vpc_id not provided"}})

    # Step 6: HTTP Connectivity / HTTP 연결
    scheme = step1_body.get("scheme", "http")
    test_url = f"{scheme}://{hostname}"
    if port and port not in (80, 443):
        test_url += f":{port}"
    test_url += health_endpoint

    step6 = _test_http_connectivity({"url": test_url, "timeout_seconds": 10})
    step6_body = json.loads(step6["body"]) if isinstance(step6.get("body"), str) else step6.get("body", {})
    http_ok = step6_body.get("reachable", False) and step6_body.get("status_code") in (200, 204, 301, 302)
    step_status = "pass" if http_ok else "fail"
    if step_status == "fail":
        overall_status = "fail"
    steps.append({"step": 6, "name": "test_http_connectivity", "status": step_status, "result": step6_body})

    # Build summary / 요약 생성
    failed_steps = [s for s in steps if s["status"] == "fail"]
    warned_steps = [s for s in steps if s["status"] == "warn"]

    if not failed_steps and not warned_steps:
        summary = "All diagnostic steps passed. Datasource connectivity is healthy."
    elif failed_steps:
        names = ", ".join(s["name"] for s in failed_steps)
        summary = f"Diagnosis failed at: {names}. See step details for remediation."
    else:
        names = ", ".join(s["name"] for s in warned_steps)
        summary = f"Diagnosis completed with warnings: {names}."

    return ok({
        "url": url,
        "datasource_type": ds_type,
        "steps": steps,
        "overall_status": overall_status,
        "summary": summary,
        "recommendations": _build_recommendations(steps),
    })


# ============================================================================
# Helpers / 헬퍼 함수
# ============================================================================

def _is_private_ip(ip_str):
    try:
        return ipaddress.ip_address(ip_str).is_private
    except ValueError:
        return False


def _cidr_contains(cidr, ip_or_cidr):
    """Check if cidr contains the given IP or overlaps with another CIDR."""
    try:
        network = ipaddress.ip_network(cidr, strict=False)
        # Try as single IP first / 단일 IP로 먼저 시도
        try:
            return ipaddress.ip_address(ip_or_cidr) in network
        except ValueError:
            pass
        # Try as CIDR / CIDR로 시도
        try:
            other = ipaddress.ip_network(ip_or_cidr, strict=False)
            return network.overlaps(other)
        except ValueError:
            pass
    except ValueError:
        pass
    return False


def _get_tag(resource, key):
    for tag in resource.get("Tags", []):
        if tag.get("Key") == key:
            return tag.get("Value", "")
    return ""


def _build_recommendations(steps):
    """Build actionable recommendations from diagnostic results.
    진단 결과에서 실행 가능한 권장 조치 생성."""
    recs = []
    for s in steps:
        if s["status"] == "fail":
            name = s["name"]
            result = s.get("result", {})
            if name == "validate_url":
                recs.append("Fix the datasource URL format (check scheme, hostname, port)")
            elif name == "resolve_dns":
                recs.append(f"DNS resolution failed for hostname. Check VPC DNS settings and Route 53 resolver rules.")
            elif name == "check_nlb_targets":
                unhealthy = sum(tg.get("unhealthy_count", 0) for tg in result.get("target_groups", []))
                if unhealthy > 0:
                    recs.append(f"NLB has {unhealthy} unhealthy target(s). Check target Pod/instance health and health check configuration.")
                else:
                    recs.append("NLB issue detected. Verify NLB is in 'active' state and has registered targets.")
            elif name == "analyze_security_groups":
                for sg in result.get("sg_analysis", []):
                    suggestion = sg.get("suggestion")
                    if suggestion:
                        recs.append(suggestion)
            elif name == "trace_network_path":
                for m in result.get("missing", []):
                    recs.append(f"Missing route: {m}")
            elif name == "test_http_connectivity":
                error = result.get("error", "")
                if "timed out" in error.lower() or "timeout" in error.lower():
                    recs.append("HTTP connection timed out. Check Security Groups, NACLs, and network path.")
                elif "refused" in error.lower():
                    recs.append("Connection refused. The target service may not be running or not listening on the expected port.")
                else:
                    recs.append(f"HTTP connectivity failed: {error}")
    return recs


def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}


def err(msg):
    return {"statusCode": 400, "body": json.dumps({"error": msg})}
