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
