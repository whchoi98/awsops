"""Cross-account boto3 client helper for AWSops Lambda functions."""
import boto3
import re
import time

_ARN_PATTERN = re.compile(r'^arn:aws:iam::\d{12}:role/[\w+=,.@-]+$')

_sts_client = None
_credential_cache = {}  # {role_arn: (credentials, timestamp)}
_CACHE_TTL = 3000  # 50 minutes (STS credentials expire after 60 min)


def get_client(service, region='ap-northeast-2', role_arn=None, session_suffix=None):
    """Get boto3 client, optionally assuming a cross-account role.

    Args:
        service: AWS service name (e.g., 'ec2', 'rds')
        region: AWS region
        role_arn: If provided, assume this role before creating client

    Returns:
        boto3 client for the specified service
    """
    if not role_arn:
        return boto3.client(service, region_name=region)

    if not _ARN_PATTERN.match(role_arn):
        raise ValueError(f'Invalid role ARN: {role_arn}')

    global _sts_client
    if _sts_client is None:
        _sts_client = boto3.client('sts')

    # Cache credentials with TTL (re-assume before STS expiry)
    cached = _credential_cache.get(role_arn)
    if not cached or (time.time() - cached[1]) > _CACHE_TTL:
        resp = _sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName=f'awsops-{session_suffix or service}',
            DurationSeconds=3600,
        )
        _credential_cache[role_arn] = (resp['Credentials'], time.time())

    creds = _credential_cache[role_arn][0]
    return boto3.client(
        service,
        region_name=region,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
    )
