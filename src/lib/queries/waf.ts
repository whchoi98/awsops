export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_wafv2_web_acl) AS total_web_acls,
      (SELECT COUNT(*) FROM aws_wafv2_rule_group) AS total_rule_groups,
      (SELECT COUNT(*) FROM aws_wafv2_ip_set) AS total_ip_sets
  `,

  webAclList: `
    SELECT
      account_id,
      name,
      id,
      arn,
      scope,
      capacity,
      default_action::text AS default_action,
      description,
      region
    FROM
      aws_wafv2_web_acl
    ORDER BY
      name
  `,

  detail: `
    SELECT
      account_id,
      name,
      id,
      arn,
      scope,
      capacity,
      default_action::text AS default_action,
      description,
      rules::text AS rules,
      visibility_config::text AS visibility_config,
      tags,
      region
    FROM
      aws_wafv2_web_acl
    WHERE
      id = '{acl_id}' AND name = '{acl_name}'
  `
};
