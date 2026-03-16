"""VPC Flow Log Monitor Lambda / VPC 흐름 로그 모니터링 Lambda"""
# VPC 흐름 로그 조회 및 분석 / Query and analyze VPC flow logs
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
    vpc_id = params['vpc_id']

    # 흐름 로그 조회 / Query flow logs
    resp = ec2.describe_flow_logs(Filters=[{'Name': 'resource-id', 'Values': [vpc_id]}])
    flow_logs = [{'FlowLogId': fl.get('FlowLogId'), 'ResourceId': fl.get('ResourceId'),
        'TrafficType': fl.get('TrafficType'), 'LogStatus': fl.get('LogStatus'),
        'LogDestination': fl.get('LogDestination')} for fl in resp.get('FlowLogs', [])]

    return {'statusCode': 200, 'body': json.dumps({
        'vpcId': vpc_id, 'flowLogs': flow_logs, 'count': len(flow_logs)})}
