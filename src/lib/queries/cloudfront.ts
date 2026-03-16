export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_distributions,
      COUNT(*) FILTER (WHERE enabled = true) AS enabled_count,
      COUNT(*) FILTER (WHERE enabled = false) AS disabled_count,
      COUNT(*) FILTER (WHERE default_cache_behavior ->> 'ViewerProtocolPolicy' = 'allow-all') AS http_allowed
    FROM
      aws_cloudfront_distribution
  `,

  list: `
    SELECT
      account_id,
      id,
      domain_name,
      status,
      enabled,
      e_tag,
      default_cache_behavior ->> 'ViewerProtocolPolicy' AS viewer_protocol,
      origins::text AS origins,
      aliases::text AS aliases,
      tags ->> 'Name' AS name,
      region
    FROM
      aws_cloudfront_distribution
    ORDER BY
      domain_name
  `,

  detail: `
    SELECT
      account_id,
      id,
      arn,
      domain_name,
      status,
      enabled,
      e_tag,
      http_version,
      is_ipv6_enabled,
      price_class,
      web_acl_id,
      default_cache_behavior::text AS default_cache_behavior,
      origins::text AS origins,
      aliases::text AS aliases,
      cache_behaviors::text AS cache_behaviors,
      tags,
      region
    FROM
      aws_cloudfront_distribution
    WHERE
      id = '{dist_id}'
  `
};
