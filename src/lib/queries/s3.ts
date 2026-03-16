export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_buckets,
      COUNT(*) FILTER (
        WHERE bucket_policy_is_public = true
        OR block_public_acls = false
      ) AS public_buckets,
      COUNT(*) FILTER (
        WHERE versioning_enabled = true
      ) AS versioning_enabled
    FROM
      aws_s3_bucket
  `,

  list: `
    SELECT
      account_id,
      name,
      region,
      creation_date,
      versioning_enabled,
      bucket_policy_is_public,
      server_side_encryption_configuration IS NOT NULL AS encryption_enabled,
      logging ->> 'TargetBucket' AS logging_target,
      tags ->> 'Environment' AS environment
    FROM
      aws_s3_bucket
    ORDER BY
      creation_date DESC
  `,

  detail: `
    SELECT
      account_id,
      name,
      arn,
      region,
      creation_date,
      bucket_policy_is_public,
      block_public_acls,
      block_public_policy,
      ignore_public_acls,
      restrict_public_buckets,
      versioning_enabled,
      server_side_encryption_configuration,
      logging,
      lifecycle_rules,
      tags
    FROM
      aws_s3_bucket
    WHERE
      name = '{name}'
  `,

  // IAM roles with S3 access policies / S3 접근 정책이 있는 IAM 역할
  s3IamRoles: `
    SELECT
      name AS role_name,
      arn AS role_arn,
      attached_policy_arns::text AS policies
    FROM
      aws_iam_role
    WHERE
      attached_policy_arns::text LIKE '%S3%'
      OR attached_policy_arns::text LIKE '%s3%'
      OR attached_policy_arns::text LIKE '%AdministratorAccess%'
    ORDER BY name
    LIMIT 30
  `,

  publicBuckets: `
    SELECT
      name,
      region,
      creation_date,
      bucket_policy_is_public,
      block_public_acls,
      block_public_policy,
      restrict_public_buckets,
      ignore_public_acls
    FROM
      aws_s3_bucket
    WHERE
      bucket_policy_is_public = true
      OR block_public_acls = false
      OR block_public_policy = false
    ORDER BY
      name
  `
};
