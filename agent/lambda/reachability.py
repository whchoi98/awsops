"""VPC Reachability Analyzer Lambda / VPC 도달성 분석 Lambda"""
# VPC 리소스 간 네트워크 도달성 분석 / Analyze network reachability between VPC resources
import boto3, json
from cross_account import get_client

def lambda_handler(event, context):
    # 파라미터 추출 / Extract parameters
    params = event if isinstance(event, dict) else json.loads(event)
    args = params.get("arguments", params)
    region = args.get("region", "ap-northeast-2")
    target_account_id = args.get('target_account_id')
    role_arn = f'arn:aws:iam::{target_account_id}:role/AWSopsReadOnlyRole' if target_account_id else None
    ec2 = get_client('ec2', region, role_arn)
    source = params['source']
    destination = params['destination']
    protocol = params.get('protocol', 'tcp')
    port = params.get('port', 443)

    # 네트워크 인사이트 경로 생성 / Create network insights path
    path_resp = ec2.create_network_insights_path(
        Source=source, Destination=destination,
        Protocol=protocol, DestinationPort=int(port),
        TagSpecifications=[{'ResourceType': 'network-insights-path',
            'Tags': [{'Key': 'CreatedBy', 'Value': 'awsops'}]}]
    )
    path_id = path_resp['NetworkInsightsPath']['NetworkInsightsPathId']

    # 분석 시작 / Start analysis
    analysis_resp = ec2.start_network_insights_analysis(NetworkInsightsPathId=path_id)
    analysis_id = analysis_resp['NetworkInsightsAnalysis']['NetworkInsightsAnalysisId']

    return {'statusCode': 200, 'body': json.dumps({
        'pathId': path_id, 'analysisId': analysis_id,
        'status': analysis_resp['NetworkInsightsAnalysis']['Status']})}
