export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_domains,
      COUNT(*) FILTER (WHERE processing = false) AS active_domains,
      COUNT(*) FILTER (WHERE processing = true) AS processing_domains,
      COUNT(*) FILTER (WHERE node_to_node_encryption_options_enabled = true) AS node_encrypted,
      COUNT(*) FILTER (WHERE encrypt_at_rest_options ->> 'Enabled' = 'true') AS rest_encrypted,
      COUNT(*) FILTER (WHERE vpc_options IS NOT NULL AND vpc_options::text != 'null') AS vpc_domains
    FROM aws_opensearch_domain
  `,

  list: `
    SELECT
      domain_name,
      arn,
      engine_version,
      processing,
      created,
      node_to_node_encryption_options_enabled,
      encrypt_at_rest_options ->> 'Enabled' AS encrypt_at_rest,
      cluster_config::text AS cluster_config,
      vpc_options::text AS vpc_options,
      ebs_options::text AS ebs_options,
      endpoints::text AS endpoints,
      tags ->> 'Name' AS name
    FROM aws_opensearch_domain
    ORDER BY domain_name
  `,

  engineDistribution: `
    SELECT engine_version AS name, COUNT(*) AS value
    FROM aws_opensearch_domain
    GROUP BY engine_version
    ORDER BY value DESC
  `,

  encryptionDistribution: `
    SELECT
      CASE
        WHEN node_to_node_encryption_options_enabled = true
          AND encrypt_at_rest_options ->> 'Enabled' = 'true' THEN 'Full Encryption'
        WHEN node_to_node_encryption_options_enabled = true
          OR encrypt_at_rest_options ->> 'Enabled' = 'true' THEN 'Partial'
        ELSE 'No Encryption'
      END AS name,
      COUNT(*) AS value
    FROM aws_opensearch_domain
    GROUP BY 1
  `,

  // Domain detail / 도메인 상세
  detail: `
    SELECT
      domain_name,
      arn,
      domain_id,
      engine_version,
      processing,
      created,
      node_to_node_encryption_options_enabled,
      encrypt_at_rest_options::text AS encrypt_at_rest_options,
      cluster_config::text AS cluster_config,
      vpc_options::text AS vpc_options,
      ebs_options::text AS ebs_options,
      endpoints::text AS endpoints,
      access_policies,
      advanced_options::text AS advanced_options,
      log_publishing_options::text AS log_publishing_options,
      cognito_options::text AS cognito_options,
      auto_tune_options::text AS auto_tune_options,
      tags::text AS tags
    FROM aws_opensearch_domain
    WHERE domain_name = '{domain_name}'
  `,
};
