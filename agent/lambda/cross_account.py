"""Cross-account boto3 client helper for AWSops Lambda functions."""
import boto3

_sts_client = None
_credential_cache = {}


def get_client(service, region='ap-northeast-2', role_arn=None):
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

    global _sts_client
    if _sts_client is None:
        _sts_client = boto3.client('sts')

    # Cache credentials by role_arn (they last ~1 hour)
    if role_arn not in _credential_cache:
        resp = _sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName='awsops-lambda',
            DurationSeconds=3600,
        )
        _credential_cache[role_arn] = resp['Credentials']

    creds = _credential_cache[role_arn]
    return boto3.client(
        service,
        region_name=region,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
    )
