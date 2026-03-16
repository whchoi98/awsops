"""
AWS Network MCP Lambda - VPC, TGW, VPN, ENI, Network Firewall, Flow Logs
AWS 네트워크 MCP Lambda - VPC, TGW, VPN, ENI, Network Firewall, Flow Logs

# Provides 15+ network troubleshooting tools via AgentCore Gateway MCP.
# AgentCore Gateway MCP를 통해 15개 이상의 네트워크 트러블슈팅 도구를 제공합니다.
"""
import json
import boto3
import time
from cross_account import get_client


def lambda_handler(event, context):
    # Parse event and extract tool name and arguments / 이벤트를 파싱하고 도구 이름과 인자를 추출
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    region = args.get("region", "ap-northeast-2")
    target_account_id = args.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Auto-detect tool from parameters if tool_name not provided / tool_name이 없으면 파라미터로 도구를 자동 감지
    if not t:
        if "ip_address" in params: t = "find_ip_address"
        elif "eni_id" in params: t = "get_eni_details"
        elif "tgw_id" in params and "route_table_id" in params: t = "get_tgw_routes"
        elif "tgw_id" in params: t = "get_tgw_details"
        elif "vpc_id" in params and "flow" in str(params).lower(): t = "get_vpc_flow_logs"
        elif "vpc_id" in params: t = "get_vpc_network_details"
        elif "firewall_name" in params: t = "get_firewall_rules"
        elif "resource_type" in params: t = "describe_network"
        else: t = "get_path_trace_methodology"
        args = params

    try:
        # Initialize EC2 client for the specified region / 지정된 리전에 대한 EC2 클라이언트 초기화
        ec2 = get_client('ec2', region, role_arn)

        # ========== General / 일반 ==========
        # Return step-by-step network path tracing methodology / 네트워크 경로 추적 방법론을 단계별로 반환
        if t == "get_path_trace_methodology":
            return ok({"methodology": [
                "1. Identify source and destination (IP, ENI, instance)",
                "2. find_ip_address to locate the ENI",
                "3. get_eni_details for SG, NACL, route info",
                "4. Check Security Groups (inbound/outbound rules)",
                "5. Check NACLs (allow/deny rules, rule ordering)",
                "6. Check Route Tables (destination routing)",
                "7. If cross-VPC: check TGW routes (get_tgw_routes)",
                "8. If VPN: check VPN connection status (list_vpn_connections)",
                "9. If firewall: check firewall rules (get_firewall_rules)",
                "10. Check VPC Flow Logs for ACCEPT/REJECT (get_vpc_flow_logs)"]})

        # Find ENI by IP address (private first, then public) / IP 주소로 ENI 검색 (프라이빗 우선, 그 다음 퍼블릭)
        elif t == "find_ip_address":
            ip = args.get("ip_address", "")
            filters = []
            if ip:
                # Search by private IP first / 먼저 프라이빗 IP로 검색
                filters.append({"Name": "addresses.private-ip-address", "Values": [ip]})
                resp = ec2.describe_network_interfaces(Filters=filters)
                enis = resp.get("NetworkInterfaces", [])
                if not enis:
                    # Fallback: search by public IP / 대체: 퍼블릭 IP로 검색
                    filters = [{"Name": "association.public-ip", "Values": [ip]}]
                    resp = ec2.describe_network_interfaces(Filters=filters)
                    enis = resp.get("NetworkInterfaces", [])
            else:
                return err("ip_address required")
            results = [{"eniId": e["NetworkInterfaceId"], "privateIp": e.get("PrivateIpAddress"),
                "publicIp": e.get("Association", {}).get("PublicIp"),
                "vpcId": e.get("VpcId"), "subnetId": e.get("SubnetId"),
                "az": e.get("AvailabilityZone"), "status": e.get("Status"),
                "description": e.get("Description", "")[:100],
                "attachedTo": e.get("Attachment", {}).get("InstanceId", "")}
                for e in enis[:10]]
            return ok({"ip": ip, "enis": results, "count": len(results)})

        # Get full ENI details including SG, NACL, and route table / ENI 상세 정보 조회 (SG, NACL, 라우트 테이블 포함)
        elif t == "get_eni_details":
            eni_id = args.get("eni_id", "")
            # Describe the network interface / 네트워크 인터페이스 조회
            resp = ec2.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
            e = resp["NetworkInterfaces"][0]
            subnet_id = e.get("SubnetId", "")
            # Get Security Group rules / 보안 그룹 규칙 조회
            sgs = []
            for sg in e.get("Groups", []):
                sg_detail = ec2.describe_security_groups(GroupIds=[sg["GroupId"]])["SecurityGroups"][0]
                sgs.append({"id": sg["GroupId"], "name": sg.get("GroupName"),
                    "inbound": [{"proto": r.get("IpProtocol"), "ports": "{}-{}".format(r.get("FromPort",""), r.get("ToPort","")),
                        "source": r.get("IpRanges", [{}])[0].get("CidrIp", "") if r.get("IpRanges") else r.get("UserIdGroupPairs", [{}])[0].get("GroupId", "")}
                        for r in sg_detail.get("IpPermissions", [])],
                    "outbound": [{"proto": r.get("IpProtocol"), "ports": "{}-{}".format(r.get("FromPort",""), r.get("ToPort","")),
                        "dest": r.get("IpRanges", [{}])[0].get("CidrIp", "") if r.get("IpRanges") else ""}
                        for r in sg_detail.get("IpPermissionsEgress", [])]})
            # Get NACL rules for the subnet / 서브넷의 NACL 규칙 조회
            nacls = ec2.describe_network_acls(Filters=[{"Name": "association.subnet-id", "Values": [subnet_id]}])["NetworkAcls"]
            nacl_rules = []
            if nacls:
                for entry in nacls[0].get("Entries", []):
                    nacl_rules.append({"ruleNum": entry.get("RuleNumber"), "proto": entry.get("Protocol"),
                        "action": entry.get("RuleAction"), "cidr": entry.get("CidrBlock", ""),
                        "egress": entry.get("Egress"), "ports": "{}-{}".format(
                            entry.get("PortRange", {}).get("From", ""), entry.get("PortRange", {}).get("To", ""))})
            # Get route table for subnet (fallback to VPC main route table) / 서브넷 라우트 테이블 조회 (없으면 VPC 메인 라우트 테이블로 대체)
            rts = ec2.describe_route_tables(Filters=[{"Name": "association.subnet-id", "Values": [subnet_id]}])["RouteTables"]
            if not rts:
                rts = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": [e.get("VpcId", "")]}])["RouteTables"]
            routes = []
            if rts:
                for r in rts[0].get("Routes", []):
                    routes.append({"dest": r.get("DestinationCidrBlock", r.get("DestinationPrefixListId", "")),
                        "target": r.get("GatewayId", r.get("NatGatewayId", r.get("TransitGatewayId", r.get("VpcPeeringConnectionId", "local")))),
                        "state": r.get("State", "")})
            return ok({"eniId": eni_id, "privateIp": e.get("PrivateIpAddress"), "vpcId": e.get("VpcId"),
                "subnetId": subnet_id, "az": e.get("AvailabilityZone"),
                "securityGroups": sgs, "nacl": nacl_rules, "routes": routes})

        # ========== VPC / VPC 관련 ==========
        # List all VPCs with name and CIDR / 모든 VPC를 이름과 CIDR과 함께 목록 조회
        elif t == "list_vpcs":
            vpcs = ec2.describe_vpcs().get("Vpcs", [])
            return ok({"vpcs": [{"vpcId": v["VpcId"], "cidr": v.get("CidrBlock"),
                "state": v.get("State"), "name": next((t["Value"] for t in v.get("Tags", []) if t["Key"] == "Name"), "")}
                for v in vpcs[:20]]})

        # Get comprehensive VPC network details (subnets, route tables, SGs, IGW, NAT, endpoints)
        # VPC 네트워크 상세 조회 (서브넷, 라우트 테이블, 보안 그룹, IGW, NAT, 엔드포인트)
        elif t == "get_vpc_network_details":
            vpc_id = args.get("vpc_id", "")
            # Fetch VPC and all associated network resources / VPC 및 모든 관련 네트워크 리소스 조회
            vpc = ec2.describe_vpcs(VpcIds=[vpc_id])["Vpcs"][0]
            subnets = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])["Subnets"]
            rts = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])["RouteTables"]
            sgs = ec2.describe_security_groups(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])["SecurityGroups"]
            igws = ec2.describe_internet_gateways(Filters=[{"Name": "attachment.vpc-id", "Values": [vpc_id]}])["InternetGateways"]
            nats = ec2.describe_nat_gateways(Filter=[{"Name": "vpc-id", "Values": [vpc_id]}])["NatGateways"]
            endpoints = ec2.describe_vpc_endpoints(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])["VpcEndpoints"]
            return ok({"vpcId": vpc_id, "cidr": vpc.get("CidrBlock"),
                "subnets": [{"id": s["SubnetId"], "cidr": s["CidrBlock"], "az": s["AvailabilityZone"],
                    "name": next((t["Value"] for t in s.get("Tags", []) if t["Key"] == "Name"), "")} for s in subnets],
                "routeTables": len(rts), "securityGroups": len(sgs),
                "internetGateways": [i["InternetGatewayId"] for i in igws],
                "natGateways": [{"id": n["NatGatewayId"], "state": n["State"], "subnetId": n.get("SubnetId")} for n in nats],
                "vpcEndpoints": [{"id": e["VpcEndpointId"], "service": e["ServiceName"], "type": e["VpcEndpointType"]} for e in endpoints[:10]]})

        # Retrieve VPC Flow Logs from CloudWatch Logs / CloudWatch Logs에서 VPC Flow Logs 조회
        elif t == "get_vpc_flow_logs":
            vpc_id = args.get("vpc_id", "")
            minutes = args.get("minutes", 30)
            filter_pattern = args.get("filter_pattern", "")
            # Check if flow logs are configured for this VPC / 이 VPC에 플로우 로그가 설정되어 있는지 확인
            fls = ec2.describe_flow_logs(Filters=[{"Name": "resource-id", "Values": [vpc_id]}])["FlowLogs"]
            if not fls:
                return ok({"vpc_id": vpc_id, "message": "No flow logs configured for this VPC"})
            log_group = fls[0].get("LogGroupName", "")
            if not log_group:
                return ok({"vpc_id": vpc_id, "flowLogs": [{"id": f["FlowLogId"], "destination": f.get("LogDestination", "")} for f in fls],
                    "message": "Flow logs use S3 destination, not CloudWatch"})
            # Query CloudWatch Logs for flow log events / CloudWatch Logs에서 플로우 로그 이벤트 조회
            logs = get_client('logs', region, role_arn)
            start = int((time.time() - minutes * 60) * 1000)
            try:
                resp = logs.filter_log_events(logGroupName=log_group, startTime=start, limit=50, filterPattern=filter_pattern)
                events = [{"timestamp": e.get("timestamp"), "message": e.get("message", "")[:200]} for e in resp.get("events", [])]
                return ok({"vpc_id": vpc_id, "logGroup": log_group, "events": events, "count": len(events)})
            except Exception as e:
                # Return error with log group info for debugging / 디버깅을 위해 로그 그룹 정보와 함께 오류 반환
                return ok({"vpc_id": vpc_id, "logGroup": log_group, "error": str(e)})

        # Describe network resources by type (SG, NACL, route table, subnet, VPC)
        # 유형별 네트워크 리소스 조회 (보안 그룹, NACL, 라우트 테이블, 서브넷, VPC)
        elif t == "describe_network":
            rt = args.get("resource_type", "")
            rid = args.get("resource_id", "")
            vpc = args.get("vpc_id", "")
            if rt == "security_group":
                f = [{"Name": "group-id", "Values": [rid]}] if rid else [{"Name": "vpc-id", "Values": [vpc]}] if vpc else []
                r = ec2.describe_security_groups(Filters=f) if f else ec2.describe_security_groups()
                r.pop("ResponseMetadata", None)
                return ok(r)
            elif rt == "nacl":
                f = [{"Name": "network-acl-id", "Values": [rid]}] if rid else [{"Name": "vpc-id", "Values": [vpc]}] if vpc else []
                r = ec2.describe_network_acls(Filters=f) if f else ec2.describe_network_acls()
                r.pop("ResponseMetadata", None)
                return ok(r)
            elif rt == "route_table":
                f = [{"Name": "route-table-id", "Values": [rid]}] if rid else [{"Name": "vpc-id", "Values": [vpc]}] if vpc else []
                r = ec2.describe_route_tables(Filters=f) if f else ec2.describe_route_tables()
                r.pop("ResponseMetadata", None)
                return ok(r)
            elif rt == "subnet":
                f = [{"Name": "subnet-id", "Values": [rid]}] if rid else [{"Name": "vpc-id", "Values": [vpc]}] if vpc else []
                r = ec2.describe_subnets(Filters=f) if f else ec2.describe_subnets()
                r.pop("ResponseMetadata", None)
                return ok(r)
            elif rt == "vpc":
                r = ec2.describe_vpcs(VpcIds=[rid] if rid else [])
                r.pop("ResponseMetadata", None)
                return ok(r)
            return err("Unknown resource_type: " + rt)

        # ========== Transit Gateway / Transit Gateway 관련 ==========
        # List all Transit Gateways / 모든 Transit Gateway 목록 조회
        elif t == "list_transit_gateways":
            tgws = ec2.describe_transit_gateways().get("TransitGateways", [])
            return ok({"transitGateways": [{"id": g["TransitGatewayId"], "state": g["State"],
                "ownerId": g.get("OwnerId"), "asn": g.get("Options", {}).get("AmazonSideAsn"),
                "name": next((t["Value"] for t in g.get("Tags", []) if t["Key"] == "Name"), "")}
                for g in tgws[:20]]})

        # Get TGW details with attachments and route tables / TGW 상세 정보, 어태치먼트, 라우트 테이블 조회
        elif t == "get_tgw_details":
            tgw_id = args.get("tgw_id", "")
            tgw = ec2.describe_transit_gateways(TransitGatewayIds=[tgw_id])["TransitGateways"][0]
            attachments = ec2.describe_transit_gateway_attachments(Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}])["TransitGatewayAttachments"]
            rts = ec2.describe_transit_gateway_route_tables(Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}])["TransitGatewayRouteTables"]
            return ok({"tgwId": tgw_id, "state": tgw["State"], "options": tgw.get("Options", {}),
                "attachments": [{"id": a["TransitGatewayAttachmentId"], "type": a["ResourceType"],
                    "resourceId": a.get("ResourceId", ""), "state": a["State"]}
                    for a in attachments[:20]],
                "routeTables": [{"id": r["TransitGatewayRouteTableId"], "state": r["State"],
                    "defaultAssociation": r.get("DefaultAssociationRouteTable", False)}
                    for r in rts]})

        # Search TGW route table for active/blackhole routes / TGW 라우트 테이블에서 활성/블랙홀 경로 검색
        elif t == "get_tgw_routes":
            rt_id = args.get("route_table_id", "")
            routes = ec2.search_transit_gateway_routes(
                TransitGatewayRouteTableId=rt_id,
                Filters=[{"Name": "state", "Values": ["active", "blackhole"]}])["Routes"]
            return ok({"routeTableId": rt_id, "routes": [{"dest": r.get("DestinationCidrBlock", ""),
                "type": r.get("Type", ""), "state": r.get("State", ""),
                "attachmentId": r.get("TransitGatewayAttachments", [{}])[0].get("TransitGatewayAttachmentId", "") if r.get("TransitGatewayAttachments") else ""}
                for r in routes[:50]]})

        # Get routes from all route tables of a TGW / TGW의 모든 라우트 테이블에서 경로 조회
        elif t == "get_all_tgw_routes":
            tgw_id = args.get("tgw_id", "")
            rts = ec2.describe_transit_gateway_route_tables(Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}])["TransitGatewayRouteTables"]
            all_routes = []
            for rt in rts:
                rt_id = rt["TransitGatewayRouteTableId"]
                routes = ec2.search_transit_gateway_routes(TransitGatewayRouteTableId=rt_id,
                    Filters=[{"Name": "state", "Values": ["active", "blackhole"]}])["Routes"]
                all_routes.append({"routeTableId": rt_id, "routeCount": len(routes),
                    "routes": [{"dest": r.get("DestinationCidrBlock", ""), "state": r.get("State")} for r in routes[:20]]})
            return ok({"tgwId": tgw_id, "routeTables": all_routes})

        # List TGW peering attachments / TGW 피어링 어태치먼트 목록 조회
        elif t == "list_tgw_peerings":
            tgw_id = args.get("tgw_id", "")
            attachments = ec2.describe_transit_gateway_attachments(
                Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}, {"Name": "resource-type", "Values": ["peering"]}])["TransitGatewayAttachments"]
            return ok({"tgwId": tgw_id, "peerings": [{"id": a["TransitGatewayAttachmentId"],
                "state": a["State"], "resourceId": a.get("ResourceId", "")} for a in attachments]})

        # ========== VPN / VPN 관련 ==========
        # List VPN connections with tunnel status / VPN 연결 목록 및 터널 상태 조회
        elif t == "list_vpn_connections":
            vpns = ec2.describe_vpn_connections().get("VpnConnections", [])
            return ok({"vpnConnections": [{"id": v["VpnConnectionId"], "state": v["State"],
                "type": v.get("Type", ""), "tgwId": v.get("TransitGatewayId", ""),
                "vgwId": v.get("VpnGatewayId", ""), "customerGw": v.get("CustomerGatewayId", ""),
                "tunnels": [{"status": t.get("Status"), "outsideIp": t.get("OutsideIpAddress")}
                    for t in v.get("VgwTelemetry", [])]}
                for v in vpns[:20]]})

        # ========== Network Firewall / 네트워크 방화벽 관련 ==========
        # List AWS Network Firewalls / AWS Network Firewall 목록 조회
        elif t == "list_network_firewalls":
            nfw = get_client('network-firewall', region, role_arn)
            fws = nfw.list_firewalls().get("Firewalls", [])
            return ok({"firewalls": [{"name": f.get("FirewallName"), "arn": f.get("FirewallArn")} for f in fws[:20]]})

        # Get firewall policy rules (stateless + stateful) / 방화벽 정책 규칙 조회 (스테이트리스 + 스테이트풀)
        elif t == "get_firewall_rules":
            nfw = get_client('network-firewall', region, role_arn)
            fw_name = args.get("firewall_name", "")
            # Describe firewall and its associated policy / 방화벽 및 연결된 정책 조회
            fw = nfw.describe_firewall(FirewallName=fw_name)
            policy_arn = fw["Firewall"].get("FirewallPolicyArn", "")
            policy = nfw.describe_firewall_policy(FirewallPolicyArn=policy_arn)
            fp = policy.get("FirewallPolicy", {})
            stateless = fp.get("StatelessRuleGroupReferences", [])
            stateful = fp.get("StatefulRuleGroupReferences", [])
            return ok({"firewallName": fw_name, "policyArn": policy_arn,
                "statelessRuleGroups": [r.get("ResourceArn", "").split("/")[-1] for r in stateless],
                "statefulRuleGroups": [r.get("ResourceArn", "").split("/")[-1] for r in stateful],
                "statelessDefaultActions": fp.get("StatelessDefaultActions", [])})

        return err("Unknown tool: " + t)

    except Exception as e:
        # Global error handler - return 500 with error message / 전역 오류 처리 - 오류 메시지와 함께 500 반환
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


# Helper: return HTTP 200 success response / 헬퍼: HTTP 200 성공 응답 반환
def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}

# Helper: return HTTP 400 error response / 헬퍼: HTTP 400 오류 응답 반환
def err(msg):
    return {"statusCode": 400, "body": json.dumps({"error": msg})}
