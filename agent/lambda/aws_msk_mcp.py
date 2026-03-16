"""
AWS MSK MCP Lambda - Kafka cluster management, configuration, monitoring
AWS MSK MCP 람다 - Kafka 클러스터 관리, 구성, 모니터링
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
        if "cluster_arn" in params and "configuration" in str(params).lower(): t = "get_configuration_info"
        elif "cluster_arn" in params: t = "get_cluster_info"
        else: t = "list_clusters"
        args = params

    try:
        kafka = get_client('kafka', region, role_arn)

        # List all MSK clusters (provisioned and serverless) / 모든 MSK 클러스터 조회 (프로비저닝 및 서버리스)
        if t == "list_clusters":
            # List clusters using v2 API / v2 API로 클러스터 목록 조회
            resp = kafka.list_clusters_v2()
            clusters = []
            for c in resp.get("ClusterInfoList", [])[:20]:
                info = c.get("Provisioned", c.get("Serverless", {}))
                clusters.append({"name": c.get("ClusterName"), "arn": c.get("ClusterArn"),
                    "state": c.get("State"), "type": c.get("ClusterType"),
                    "version": info.get("CurrentBrokerSoftwareInfo", {}).get("KafkaVersion", ""),
                    "brokerCount": info.get("NumberOfBrokerNodes", 0)})
            return ok({"clusters": clusters, "count": len(clusters)})

        # Get detailed MSK cluster info with broker config / MSK 클러스터 상세 정보 및 브로커 설정 조회
        elif t == "get_cluster_info":
            arn = args["cluster_arn"]
            # Describe cluster using v2 API / v2 API로 클러스터 상세 조회
            c = kafka.describe_cluster_v2(ClusterArn=arn)["ClusterInfo"]
            info = c.get("Provisioned", {})
            broker_info = info.get("BrokerNodeGroupInfo", {})
            return ok({"name": c.get("ClusterName"), "arn": arn, "state": c.get("State"),
                "type": c.get("ClusterType"), "version": info.get("CurrentBrokerSoftwareInfo", {}).get("KafkaVersion"),
                "brokerCount": info.get("NumberOfBrokerNodes"),
                "brokerType": broker_info.get("InstanceType"),
                "storagePerBroker": broker_info.get("StorageInfo", {}).get("EbsStorageInfo", {}).get("VolumeSize"),
                "subnets": broker_info.get("ClientSubnets", []),
                "securityGroups": broker_info.get("SecurityGroups", []),
                "zookeeperEndpoints": c.get("ZookeeperConnectString", ""),
                "bootstrapBrokers": get_bootstrap(kafka, arn)})

        # Get MSK configuration details or list configurations / MSK 구성 상세 조회 또는 구성 목록 조회
        elif t == "get_configuration_info":
            arn = args.get("configuration_arn", "")
            if arn:
                resp = kafka.describe_configuration(Arn=arn)
                return ok({"name": resp.get("Name"), "arn": arn, "state": resp.get("State"),
                    "latestRevision": resp.get("LatestRevision", {}).get("Revision"),
                    "description": resp.get("Description", "")})
            configs = kafka.list_configurations().get("Configurations", [])
            return ok({"configurations": [{"name": c.get("Name"), "arn": c.get("Arn"),
                "state": c.get("State")} for c in configs[:20]]})

        # Get bootstrap broker connection string / 부트스트랩 브로커 연결 문자열 조회
        elif t == "get_bootstrap_brokers":
            return ok({"bootstrapBrokers": get_bootstrap(kafka, args["cluster_arn"])})

        # List broker nodes in the cluster / 클러스터 내 브로커 노드 목록 조회
        elif t == "list_nodes":
            arn = args["cluster_arn"]
            nodes = kafka.list_nodes(ClusterArn=arn).get("NodeInfoList", [])
            return ok({"nodes": [{"nodeType": n.get("NodeType"), "nodeARN": n.get("NodeARN"),
                "instanceType": n.get("InstanceType"),
                "brokerId": n.get("BrokerNodeInfo", {}).get("BrokerId"),
                "endpoints": n.get("BrokerNodeInfo", {}).get("Endpoints", [])}
                for n in nodes[:30]]})

        # Return MSK/Kafka best practices / MSK/Kafka 모범 사례 반환
        elif t == "msk_best_practices":
            return ok({"bestPractices": [
                "Use m7g.xlarge+ for production brokers",
                "3+ brokers across 3 AZs for HA",
                "Enable encryption in-transit (TLS) and at-rest",
                "Use IAM authentication over SASL/SCRAM when possible",
                "Monitor: UnderReplicatedPartitions, ActiveControllerCount, OfflinePartitionsCount",
                "Set retention.ms based on consumer lag patterns",
                "Use tiered storage for cost optimization on large topics",
                "Enable MSK Connect for managed Kafka connectors"]})

        return err("Unknown tool: " + t)
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


# Get bootstrap broker string for a cluster / 클러스터의 부트스트랩 브로커 문자열 조회
def get_bootstrap(kafka, arn):
    try:
        resp = kafka.get_bootstrap_brokers(ClusterArn=arn)
        return resp.get("BootstrapBrokerStringTls", resp.get("BootstrapBrokerString", ""))
    except: return ""

# Return success response / 성공 응답 반환
def ok(body): return {"statusCode": 200, "body": json.dumps(body, default=str)}
# Return error response / 오류 응답 반환
def err(msg): return {"statusCode": 400, "body": json.dumps({"error": msg})}
