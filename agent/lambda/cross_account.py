"""
Cross-account credential helper for AWSops Lambda functions.
Uses STS AssumeRole with 50-minute TTL credential caching.
크로스 어카운트 자격증명 헬퍼. STS AssumeRole + 50분 캐싱.
"""
import boto3
import os
import time
import re
import logging
import json

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_ARN_PATTERN = re.compile(r'^arn:aws:iam::\d{12}:role/[\w+=,.@-]+$')
_credential_cache = {}  # {role_arn: (credentials_dict, timestamp)}
_CACHE_TTL = 3000  # 50 minutes
_MAX_CACHE = 50
_EXTERNAL_ID = os.environ.get('AWSOPS_EXTERNAL_ID', '')


def get_role_arn(account_id):
    """Build role ARN using configurable role name."""
    role_name = os.environ.get('AWSOPS_ROLE_NAME', 'AWSopsReadOnlyRole')
    return f'arn:aws:iam::{account_id}:role/{role_name}'


def _assume_role(role_arn, session_suffix=None):
    """Assume role with credential caching."""
    if not _ARN_PATTERN.match(role_arn):
        raise ValueError(f'Invalid role ARN: {role_arn}')

    cached = _credential_cache.get(role_arn)
    if cached and (time.time() - cached[1]) < _CACHE_TTL:
        return cached[0]

    session_name = f'awsops-lambda-{session_suffix}' if session_suffix else 'awsops-lambda'
    sts = boto3.client('sts')
    assume_params = {
        'RoleArn': role_arn,
        'RoleSessionName': session_name,
        'DurationSeconds': 3600,
    }
    if _EXTERNAL_ID:
        assume_params['ExternalId'] = _EXTERNAL_ID
    resp = sts.assume_role(**assume_params)
    # Audit log for cross-account access / 크로스 어카운트 접근 감사 로그
    logger.info(json.dumps({
        'event': 'assume_role',
        'role_arn': role_arn,
        'session_name': session_name,
        'expiration': resp['Credentials']['Expiration'].isoformat(),
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }))
    creds = {
        'aws_access_key_id': resp['Credentials']['AccessKeyId'],
        'aws_secret_access_key': resp['Credentials']['SecretAccessKey'],
        'aws_session_token': resp['Credentials']['SessionToken'],
    }
    if len(_credential_cache) >= _MAX_CACHE:
        oldest_key = min(_credential_cache, key=lambda k: _credential_cache[k][1])
        del _credential_cache[oldest_key]
    _credential_cache[role_arn] = (creds, time.time())
    return creds


def get_client(service, region='ap-northeast-2', role_arn=None, session_suffix=None):
    """Create boto3 client, optionally assuming a cross-account role.

    Args:
        service: AWS service name (e.g., 'ec2', 'iam')
        region: AWS region
        role_arn: Full IAM Role ARN (arn:aws:iam::XXXX:role/RoleName)
        session_suffix: Optional suffix for AssumeRole session name (defaults to service name)
    """
    if not role_arn:
        return boto3.client(service, region_name=region)

    creds = _assume_role(role_arn, session_suffix or service)
    return boto3.client(service, region_name=region, **creds)


def get_resource(service, region='ap-northeast-2', role_arn=None):
    """Create boto3 resource (for DynamoDB), optionally cross-account."""
    if not role_arn:
        return boto3.resource(service, region_name=region)

    creds = _assume_role(role_arn, service)
    return boto3.resource(service, region_name=region, **creds)
