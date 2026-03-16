"""
AWS RDS MCP Lambda - MySQL/PostgreSQL instance management, queries via RDS Data API
AWS RDS MCP 람다 - MySQL/PostgreSQL 인스턴스 관리, RDS Data API를 통한 쿼리
"""
import json
import boto3
from cross_account import get_client


def lambda_handler(event, context):
    # Parse event and route to appropriate tool handler / 이벤트 파싱 후 적절한 도구 핸들러로 라우팅
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    region = args.get("region", "ap-northeast-2")
    target_account_id = args.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None

    # Auto-detect tool from parameters if not specified / tool_name 미지정 시 파라미터로 도구 자동 감지
    if not t:
        if "sql" in params and "resource_arn" in params: t = "execute_sql"
        elif "db_instance_identifier" in params: t = "describe_db_instance"
        elif "db_cluster_identifier" in params: t = "describe_db_cluster"
        else: t = "list_db_instances"
        args = params

    try:
        rds = get_client('rds', region, role_arn)

        # List all RDS instances with basic info / 모든 RDS 인스턴스 기본 정보 조회
        if t == "list_db_instances":
            # Describe all DB instances / 모든 DB 인스턴스 조회
            instances = rds.describe_db_instances().get("DBInstances", [])
            return ok({"instances": [{"id": i["DBInstanceIdentifier"], "engine": i["Engine"],
                "version": i.get("EngineVersion"), "class": i["DBInstanceClass"],
                "status": i["DBInstanceStatus"], "az": i.get("AvailabilityZone"),
                "multiAZ": i.get("MultiAZ"), "storage": i.get("AllocatedStorage"),
                "endpoint": i.get("Endpoint", {}).get("Address", "")}
                for i in instances[:20]]})

        # List all Aurora DB clusters / 모든 Aurora DB 클러스터 조회
        elif t == "list_db_clusters":
            clusters = rds.describe_db_clusters().get("DBClusters", [])
            return ok({"clusters": [{"id": c["DBClusterIdentifier"], "engine": c["Engine"],
                "version": c.get("EngineVersion"), "status": c["Status"],
                "members": len(c.get("DBClusterMembers", [])),
                "endpoint": c.get("Endpoint", ""), "readerEndpoint": c.get("ReaderEndpoint", "")}
                for c in clusters[:20]]})

        # Get detailed DB instance info / DB 인스턴스 상세 정보 조회
        elif t == "describe_db_instance":
            # Fetch instance details including networking and encryption / 네트워킹·암호화 포함 인스턴스 상세 조회
            i = rds.describe_db_instances(DBInstanceIdentifier=args["db_instance_identifier"])["DBInstances"][0]
            return ok({"id": i["DBInstanceIdentifier"], "engine": i["Engine"], "version": i.get("EngineVersion"),
                "class": i["DBInstanceClass"], "status": i["DBInstanceStatus"],
                "az": i.get("AvailabilityZone"), "multiAZ": i.get("MultiAZ"),
                "storage": i.get("AllocatedStorage"), "storageType": i.get("StorageType"),
                "encrypted": i.get("StorageEncrypted"), "vpcId": i.get("DBSubnetGroup", {}).get("VpcId"),
                "endpoint": i.get("Endpoint", {}).get("Address", ""),
                "port": i.get("Endpoint", {}).get("Port"),
                "securityGroups": [sg["VpcSecurityGroupId"] for sg in i.get("VpcSecurityGroups", [])],
                "parameterGroup": i.get("DBParameterGroups", [{}])[0].get("DBParameterGroupName", ""),
                "backupRetention": i.get("BackupRetentionPeriod"),
                "publiclyAccessible": i.get("PubliclyAccessible")})

        # Get detailed Aurora cluster info / Aurora 클러스터 상세 정보 조회
        elif t == "describe_db_cluster":
            c = rds.describe_db_clusters(DBClusterIdentifier=args["db_cluster_identifier"])["DBClusters"][0]
            return ok({"id": c["DBClusterIdentifier"], "engine": c["Engine"], "version": c.get("EngineVersion"),
                "status": c["Status"], "endpoint": c.get("Endpoint"), "readerEndpoint": c.get("ReaderEndpoint"),
                "port": c.get("Port"), "encrypted": c.get("StorageEncrypted"),
                "members": [{"id": m["DBInstanceIdentifier"], "writer": m.get("IsClusterWriter")}
                    for m in c.get("DBClusterMembers", [])],
                "backupRetention": c.get("BackupRetentionPeriod"),
                "deletionProtection": c.get("DeletionProtection")})

        # Execute read-only SQL via RDS Data API / RDS Data API를 통한 읽기 전용 SQL 실행
        elif t == "execute_sql":
            rds_data = get_client('rds-data', region, role_arn)
            # Block write operations (read-only enforcement) / 쓰기 작업 차단 (읽기 전용 강제)
            sql = args["sql"].strip()
            for kw in ["drop", "delete", "update", "insert", "alter", "create", "truncate"]:
                if kw in sql.lower().split():
                    return err("Only SELECT queries allowed")
            # Execute SQL statement via Data API / Data API로 SQL 문 실행
            resp = rds_data.execute_statement(
                resourceArn=args["resource_arn"], secretArn=args["secret_arn"],
                database=args.get("database", ""), sql=sql)
            columns = [c.get("label", c.get("name", "")) for c in resp.get("columnMetadata", [])]
            rows = []
            for record in resp.get("records", [])[:100]:
                row = {}
                for i, field in enumerate(record):
                    col = columns[i] if i < len(columns) else "col{}".format(i)
                    val = field.get("stringValue", field.get("longValue", field.get("doubleValue",
                        field.get("booleanValue", field.get("isNull", None)))))
                    row[col] = val
                rows.append(row)
            return ok({"columns": columns, "rows": rows, "rowCount": len(rows)})

        # List DB snapshots (automated or manual) / DB 스냅샷 목록 조회 (자동 또는 수동)
        elif t == "list_snapshots":
            snaps = rds.describe_db_snapshots(SnapshotType=args.get("snapshot_type", "automated")).get("DBSnapshots", [])
            return ok({"snapshots": [{"id": s["DBSnapshotIdentifier"], "instance": s.get("DBInstanceIdentifier"),
                "engine": s["Engine"], "status": s["Status"], "size": s.get("AllocatedStorage"),
                "created": str(s.get("SnapshotCreateTime", ""))} for s in snaps[:20]]})

        return err("Unknown tool: " + t)
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

# Return success response / 성공 응답 반환
def ok(body): return {"statusCode": 200, "body": json.dumps(body, default=str)}
# Return error response / 오류 응답 반환
def err(msg): return {"statusCode": 400, "body": json.dumps({"error": msg})}
