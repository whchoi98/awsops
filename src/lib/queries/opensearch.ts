// OpenSearch columns verified via information_schema
// encryption_at_rest_options (not encrypt_at_rest_options)
// cluster_config, ebs_options, vpc_options are JSONB
export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_domains,
      COUNT(*) FILTER (WHERE processing = false) AS active_domains,
      COUNT(*) FILTER (WHERE processing = true) AS processing_domains,
      COUNT(*) FILTER (WHERE node_to_node_encryption_options_enabled = true) AS node_encrypted,
      COUNT(*) FILTER (WHERE encryption_at_rest_options ->> 'Enabled' = 'true') AS rest_encrypted,
      COUNT(*) FILTER (WHERE vpc_options IS NOT NULL AND vpc_options::text != 'null' AND vpc_options::text != '{}') AS vpc_domains
    FROM aws_opensearch_domain
  `,

  list: `
    SELECT
      account_id,
      domain_name,
      arn,
      engine_version,
      processing,
      created,
      node_to_node_encryption_options_enabled,
      encryption_at_rest_options ->> 'Enabled' AS encrypt_at_rest,
      cluster_config::text AS cluster_config,
      vpc_options::text AS vpc_options,
      ebs_options::text AS ebs_options,
      endpoints::text AS endpoints,
      endpoint,
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
          AND encryption_at_rest_options ->> 'Enabled' = 'true' THEN 'Full Encryption'
        WHEN node_to_node_encryption_options_enabled = true
          OR encryption_at_rest_options ->> 'Enabled' = 'true' THEN 'Partial'
        ELSE 'No Encryption'
      END AS name,
      COUNT(*) AS value
    FROM aws_opensearch_domain
    GROUP BY 1
  `,

  // Domain detail / 도메인 상세
  detail: `
    SELECT
      account_id,
      domain_name,
      arn,
      domain_id,
      engine_version,
      engine_type,
      processing,
      created,
      endpoint,
      endpoint_v2,
      ip_address_type,
      domain_processing_status,
      node_to_node_encryption_options_enabled,
      encryption_at_rest_options::text AS encryption_at_rest_options,
      cluster_config::text AS cluster_config,
      vpc_options::text AS vpc_options,
      ebs_options::text AS ebs_options,
      endpoints::text AS endpoints,
      access_policies,
      advanced_options::text AS advanced_options,
      advanced_security_options::text AS advanced_security_options,
      log_publishing_options::text AS log_publishing_options,
      cognito_options::text AS cognito_options,
      auto_tune_options::text AS auto_tune_options,
      domain_endpoint_options::text AS domain_endpoint_options,
      service_software_options::text AS service_software_options,
      off_peak_window_options::text AS off_peak_window_options,
      tags::text AS tags
    FROM aws_opensearch_domain
    WHERE domain_name = '{domain_name}'
  `,
};
