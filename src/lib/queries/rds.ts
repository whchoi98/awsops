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
      tags
    FROM
      aws_rds_db_instance
    WHERE
      db_instance_identifier = '{id}'
  `,

  list: `
    SELECT
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
