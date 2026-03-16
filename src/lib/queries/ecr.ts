export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_repos,
      COUNT(*) FILTER (WHERE image_scanning_configuration ->> 'scanOnPush' = 'true') AS scan_enabled,
      COUNT(*) FILTER (WHERE image_tag_mutability = 'IMMUTABLE') AS immutable_tags
    FROM
      aws_ecr_repository
  `,

  list: `
    SELECT
      account_id,
      repository_name,
      repository_uri,
      image_tag_mutability,
      image_scanning_configuration ->> 'scanOnPush' AS scan_on_push,
      encryption_configuration ->> 'encryptionType' AS encryption_type,
      created_at,
      region
    FROM
      aws_ecr_repository
    ORDER BY
      repository_name
  `,

  detail: `
    SELECT
      account_id,
      repository_name,
      repository_uri,
      arn,
      registry_id,
      image_tag_mutability,
      image_scanning_configuration::text AS scan_config,
      encryption_configuration::text AS encryption_config,
      lifecycle_policy::text AS lifecycle_policy,
      created_at,
      tags,
      region
    FROM
      aws_ecr_repository
    WHERE
      repository_name = '{repo_name}'
  `
};
