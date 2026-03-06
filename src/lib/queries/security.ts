export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_s3_bucket WHERE bucket_policy_is_public = true OR block_public_acls = false) AS public_buckets,
      0 AS mfa_not_enabled,
      (SELECT COUNT(DISTINCT group_id) FROM aws_vpc_security_group_rule WHERE type = 'ingress' AND cidr_ipv4 = '0.0.0.0/0') AS open_sgs,
      (SELECT COUNT(*) FROM aws_ebs_volume WHERE encrypted = false) AS unencrypted_volumes
  `,

  publicBuckets: `
    SELECT name, region, creation_date, bucket_policy_is_public,
      block_public_acls, block_public_policy, restrict_public_buckets, ignore_public_acls
    FROM aws_s3_bucket
    WHERE bucket_policy_is_public = true OR block_public_acls = false OR block_public_policy = false
    ORDER BY name
  `,

  mfaStatus: `
    SELECT name, user_id, arn, password_last_used, create_date
    FROM aws_iam_user
    ORDER BY name
  `,

  openSecurityGroups: `
    SELECT sg.group_id, sg.group_name, sg.vpc_id,
      sgr.type, sgr.ip_protocol, sgr.from_port, sgr.to_port, sgr.cidr_ipv4,
      sg.tags ->> 'Name' AS name
    FROM aws_vpc_security_group AS sg
    JOIN aws_vpc_security_group_rule AS sgr ON sg.group_id = sgr.group_id
    WHERE sgr.type = 'ingress' AND sgr.cidr_ipv4 = '0.0.0.0/0'
    ORDER BY sg.group_name, sgr.from_port
  `,

  unencryptedVolumes: `
    SELECT volume_id, volume_type, size, state, encrypted,
      availability_zone, create_time, tags ->> 'Name' AS name
    FROM aws_ebs_volume
    WHERE encrypted = false
    ORDER BY create_time DESC
  `,

  trivyVulnerabilities: `
    SELECT vulnerability_id, package_name AS pkg_name, installed_version,
      fixed_version, severity, title, description, target, class,
      artifact_name, artifact_type
    FROM trivy_scan_vulnerability
    ORDER BY
      CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END,
      vulnerability_id
    LIMIT 200
  `,

  trivySummary: `
    SELECT severity AS name, COUNT(*) AS value
    FROM trivy_scan_vulnerability
    GROUP BY severity
    ORDER BY
      CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END
  `
};
