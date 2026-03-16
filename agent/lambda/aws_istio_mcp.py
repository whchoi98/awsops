"""
Istio Service Mesh MCP Lambda - via Steampipe Kubernetes CRD tables + EKS API
Istio 서비스 메시 MCP Lambda - Steampipe Kubernetes CRD 테이블 + EKS API 활용

# Provides 12 tools for Istio mesh inspection via Steampipe K8s plugin (requires VPC Lambda).
# Steampipe K8s 플러그인을 통해 12개의 Istio 메시 검사 도구를 제공합니다 (VPC Lambda 필요).
"""
import json
import boto3
import os
import pg8000
from cross_account import get_client


# Steampipe PostgreSQL connection config (VPC-only, same as steampipe-query Lambda)
# Steampipe PostgreSQL 연결 설정 (VPC 전용, steampipe-query Lambda와 동일)
DB_CONFIG = {
    "host": os.environ.get("STEAMPIPE_HOST", "10.254.2.254"),
    "port": int(os.environ.get("STEAMPIPE_PORT", "9193")),
    "database": "steampipe",
    "user": "steampipe",
    "password": os.environ.get("STEAMPIPE_PASSWORD", ""),
    "timeout": 30,
}


# Execute read-only SQL against Steampipe PostgreSQL / Steampipe PostgreSQL에 읽기 전용 SQL 실행
def run_sql(sql, account_id=None):
    """Execute SQL against Steampipe PostgreSQL. / Steampipe PostgreSQL에 SQL을 실행합니다."""
    try:
        # Connect via pg8000 (not psycopg2, for Lambda compatibility) / pg8000으로 연결 (Lambda 호환성을 위해 psycopg2 미사용)
        conn = pg8000.connect(**DB_CONFIG)
        cur = conn.cursor()
        if account_id:
            sanitized = ''.join(c for c in str(account_id) if c.isdigit())
            if sanitized:
                cur.execute(f"SET search_path TO public, aws_{sanitized}, kubernetes, trivy")
        cur.execute(sql)
        columns = [desc[0] for desc in cur.description] if cur.description else []
        rows = cur.fetchmany(100)
        results = [dict(zip(columns, [str(v) if v is not None else None for v in row])) for row in rows]
        cur.close()
        conn.close()
        return {"columns": columns, "rows": results, "count": len(results)}
    except Exception as e:
        # Return error with SQL for debugging / 디버깅을 위해 SQL과 함께 오류 반환
        return {"error": str(e), "sql": sql}


def lambda_handler(event, context):
    # Parse event and extract tool name and arguments / 이벤트를 파싱하고 도구 이름과 인자를 추출
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    target_account_id = args.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Auto-detect tool from parameters using keyword matching / 키워드 매칭을 통해 파라미터에서 도구를 자동 감지
    if not t:
        if "troubleshoot" in str(params).lower(): t = "istio_troubleshooting"
        elif "virtual" in str(params).lower(): t = "list_virtual_services"
        elif "destination" in str(params).lower(): t = "list_destination_rules"
        elif "gateway" in str(params).lower() and "istio" in str(params).lower(): t = "list_istio_gateways"
        elif "policy" in str(params).lower(): t = "list_authorization_policies"
        elif "sidecar" in str(params).lower(): t = "check_sidecar_injection"
        elif "crd" in str(params).lower(): t = "list_istio_crds"
        else: t = "istio_overview"
        args = params

    try:
        namespace = args.get("namespace", "")
        ns_filter = "WHERE namespace = '{}'".format(namespace) if namespace else ""

        # Get Istio mesh overview: CRDs, injected namespaces, sidecar pods / Istio 메시 개요 조회: CRD, 주입된 네임스페이스, 사이드카 파드
        if t == "istio_overview":
            results = {}
            queries = {
                "crds": "SELECT name FROM kubernetes_custom_resource_definition WHERE \"group\" LIKE '%istio.io' ORDER BY name",
                "namespaces": "SELECT name, labels FROM kubernetes_namespace WHERE labels::text LIKE '%istio-injection%'",
                "pods": "SELECT name, namespace, phase FROM kubernetes_pod WHERE containers::text LIKE '%istio-proxy%' LIMIT 20",
            }
            for key, sql in queries.items():
                results[key] = run_sql(sql, target_account_id)
            return ok(results)

        # List Istio VirtualService resources / Istio VirtualService 리소스 목록 조회
        elif t == "list_virtual_services":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_virtualservice {}ORDER BY namespace, name".format(
                ns_filter + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # List Istio DestinationRule resources / Istio DestinationRule 리소스 목록 조회
        elif t == "list_destination_rules":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_destinationrule {}ORDER BY namespace, name".format(
                ns_filter + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # List Istio Gateway resources (networking.istio.io API group) / Istio Gateway 리소스 목록 조회 (networking.istio.io API 그룹)
        elif t == "list_istio_gateways":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_gateway WHERE api_version LIKE 'networking.istio.io%' {}ORDER BY namespace, name".format(
                "AND " + ns_filter.replace("WHERE ", "") + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # List Istio ServiceEntry resources (external service registration) / Istio ServiceEntry 리소스 목록 조회 (외부 서비스 등록)
        elif t == "list_service_entries":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_serviceentry {}ORDER BY namespace, name".format(
                ns_filter + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # List Istio AuthorizationPolicy resources / Istio AuthorizationPolicy 리소스 목록 조회
        elif t == "list_authorization_policies":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_authorizationpolicy {}ORDER BY namespace, name".format(
                ns_filter + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # List Istio PeerAuthentication resources (mTLS config) / Istio PeerAuthentication 리소스 목록 조회 (mTLS 설정)
        elif t == "list_peer_authentications":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_peerauthentication {}ORDER BY namespace, name".format(
                ns_filter + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # Check sidecar injection status: injected namespaces, pods with/without sidecar
        # 사이드카 주입 상태 확인: 주입된 네임스페이스, 사이드카가 있는/없는 파드
        elif t == "check_sidecar_injection":
            results = {
                "injectedNamespaces": run_sql(
                    "SELECT name, labels FROM kubernetes_namespace WHERE labels::text LIKE '%istio-injection\":\"enabled%'", target_account_id),
                "podsWithSidecar": run_sql(
                    "SELECT name, namespace, phase FROM kubernetes_pod WHERE containers::text LIKE '%istio-proxy%' {}LIMIT 30".format(
                        "AND " + ns_filter.replace("WHERE ", "") + " " if ns_filter else ""), target_account_id),
                "podsWithoutSidecar": run_sql(
                    "SELECT p.name, p.namespace, p.phase FROM kubernetes_pod p "
                    "JOIN kubernetes_namespace n ON p.namespace = n.name "
                    "WHERE n.labels::text LIKE '%istio-injection\":\"enabled%' "
                    "AND p.containers::text NOT LIKE '%istio-proxy%' "
                    "{}LIMIT 20".format(
                        "AND " + ns_filter.replace("WHERE ", "p.") + " " if ns_filter else ""), target_account_id),
            }
            return ok(results)

        # List all Istio CRD definitions (*.istio.io group) / 모든 Istio CRD 정의 목록 조회 (*.istio.io 그룹)
        elif t == "list_istio_crds":
            sql = ("SELECT name, \"group\", version, scope "
                   "FROM kubernetes_custom_resource_definition "
                   "WHERE \"group\" LIKE '%istio.io' ORDER BY \"group\", name")
            return ok(run_sql(sql, target_account_id))

        # List Istio EnvoyFilter resources (custom Envoy proxy config) / Istio EnvoyFilter 리소스 목록 조회 (커스텀 Envoy 프록시 설정)
        elif t == "list_envoy_filters":
            sql = "SELECT name, namespace, creation_timestamp, spec FROM kubernetes_envoyfilter {}ORDER BY namespace, name".format(
                ns_filter + " " if ns_filter else "")
            return ok(run_sql(sql, target_account_id))

        # Return Istio troubleshooting guidance by issue type (general, 503, connection_refused, mtls)
        # 문제 유형별 Istio 트러블슈팅 가이드 반환 (일반, 503, 연결 거부, mTLS)
        elif t == "istio_troubleshooting":
            issue = args.get("issue", "general")
            guidance = {
                "general": [
                    "1. Check Istio CRDs installed: list_istio_crds",
                    "2. Verify sidecar injection: check_sidecar_injection",
                    "3. Check VirtualService routing: list_virtual_services",
                    "4. Verify DestinationRule: list_destination_rules",
                    "5. Check mTLS: list_peer_authentications",
                    "6. Check authorization: list_authorization_policies",
                    "7. Check istiod pods: kubectl get pods -n istio-system",
                    "8. Check proxy status: istioctl proxy-status",
                ],
                "503": [
                    "1. Check DestinationRule TLS mode matches PeerAuthentication",
                    "2. Verify service port naming (http-xxx, grpc-xxx)",
                    "3. Check if sidecar is injected on both sides",
                    "4. Review VirtualService route destinations",
                    "5. Check endpoint health: kubectl get endpoints",
                ],
                "connection_refused": [
                    "1. Verify target service is running and healthy",
                    "2. Check port configuration in VirtualService",
                    "3. Verify ServiceEntry for external services",
                    "4. Check NetworkPolicy if present",
                    "5. Review EnvoyFilter for custom configurations",
                ],
                "mtls": [
                    "1. Check PeerAuthentication mode (STRICT/PERMISSIVE/DISABLE)",
                    "2. Verify DestinationRule trafficPolicy.tls.mode",
                    "3. Ensure both pods have sidecars injected",
                    "4. Check istiod CA certificate expiry",
                    "5. Review AuthorizationPolicy for DENY rules",
                ],
            }
            return ok({"issue": issue, "steps": guidance.get(issue, guidance["general"])})

        # Execute custom read-only SQL query against Istio/K8s tables / Istio/K8s 테이블에 대해 커스텀 읽기 전용 SQL 실행
        elif t == "query_istio_resource":
            sql = args.get("sql", "")
            if not sql:
                return err("sql parameter required")
            # Block write operations (SELECT only) / 쓰기 작업 차단 (SELECT만 허용)
            for kw in ["drop", "delete", "update", "insert", "alter", "create", "truncate"]:
                if kw in sql.lower().split():
                    return err("Only SELECT queries allowed")
            return ok(run_sql(sql, target_account_id))

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
