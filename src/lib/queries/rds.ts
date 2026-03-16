export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_instances,
      COUNT(*) FILTER (WHERE status = 'available') AS available_instances,
      COUNT(*) FILTER (WHERE multi_az = true) AS multi_az_instances,
      COUNT(*) FILTER (WHERE publicly_accessible = true) AS publicly_accessible
    FROM
      aws_rds_db_instance
  `,

  engineDistribution: `
    SELECT
      engine AS name,
      COUNT(*) AS value
    FROM
      aws_rds_db_instance
    GROUP BY
      engine
    ORDER BY
      value DESC
  `,

  detail: `
    SELECT
      account_id,
      db_instance_identifier,
      engine,
      engine_version,
      class,
      status,
      multi_az,
      publicly_accessible,
      allocated_storage,
      storage_type,
      storage_encrypted,
      kms_key_id,
      vpc_id,
      db_subnet_group_name,
      availability_zone,
      endpoint_address,
      endpoint_port,
      backup_retention_period,
      preferred_backup_window,
      latest_restorable_time,
      arn,
      region,
      vpc_security_groups::text AS security_groups,
      auto_minor_version_upgrade,
      copy_tags_to_snapshot,
      deletion_protection,
      iam_database_authentication_enabled,
      performance_insights_enabled,
      tags
    FROM
      aws_rds_db_instance
    WHERE
      db_instance_identifier = '{id}'
  `,

  // RDS Security Groups with chained resources / RDS SG + 연결된 리소스
  rdsSGs: `
    SELECT
      db_instance_identifier,
      vpc_security_groups::text AS security_groups
    FROM
      aws_rds_db_instance
    WHERE
      db_instance_identifier = '{id}'
  `,

  // SG detail with inbound rules / SG 상세 + 인바운드 규칙
  sgInbound: `
    SELECT
      group_id, group_name, vpc_id,
      ip_permissions::text AS inbound_rules
    FROM
      aws_vpc_security_group
    WHERE
      group_id = '{sg_id}'
  `,

  // RDS CloudWatch metrics / RDS CloudWatch 메트릭
  rdsMetrics: `
    SELECT
      metric_name, average, maximum, minimum, timestamp
    FROM
      aws_cloudwatch_metric_statistic_data_point
    WHERE
      namespace = 'AWS/RDS'
      AND dimensions = '[{"Name":"DBInstanceIdentifier","Value":"{id}"}]'::jsonb
      AND metric_name IN ('CPUUtilization', 'FreeableMemory', 'DatabaseConnections', 'ReadIOPS', 'WriteIOPS', 'FreeStorageSpace')
      AND period = 300
      AND timestamp >= NOW() - INTERVAL '1 hour'
    ORDER BY metric_name, timestamp DESC
  `,

  list: `
    SELECT
      account_id,
      db_instance_identifier,
      engine,
      engine_version,
      class AS db_instance_class,
      status,
      multi_az,
      publicly_accessible,
      storage_encrypted,
      allocated_storage,
      region,
      vpc_id,
      create_time
    FROM
      aws_rds_db_instance
    ORDER BY
      create_time DESC
  `
};
