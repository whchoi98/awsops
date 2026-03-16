export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_elasticache_cluster) AS total_clusters,
      (SELECT COUNT(*) FROM aws_elasticache_replication_group) AS total_replication_groups,
      (SELECT COUNT(DISTINCT cache_node_type) FROM aws_elasticache_cluster) AS node_types,
      (SELECT COUNT(*) FROM aws_elasticache_cluster WHERE engine = 'redis') AS redis_count,
      (SELECT COUNT(*) FROM aws_elasticache_cluster WHERE engine = 'valkey') AS valkey_count,
      (SELECT COUNT(*) FROM aws_elasticache_cluster WHERE engine = 'memcached') AS memcached_count,
      (SELECT COALESCE(SUM(num_cache_nodes), 0) FROM aws_elasticache_cluster) AS total_nodes
  `,

  engineDistribution: `
    SELECT
      engine AS name,
      COUNT(*) AS value
    FROM
      aws_elasticache_cluster
    GROUP BY
      engine
    ORDER BY
      value DESC
  `,

  nodeTypeDistribution: `
    SELECT
      cache_node_type AS name,
      COUNT(*) AS value
    FROM
      aws_elasticache_cluster
    GROUP BY
      cache_node_type
    ORDER BY
      value DESC
  `,

  detail: `
    SELECT
      account_id,
      cache_cluster_id,
      arn,
      engine,
      engine_version,
      cache_node_type,
      cache_cluster_status,
      num_cache_nodes,
      cache_subnet_group_name,
      preferred_availability_zone,
      at_rest_encryption_enabled,
      transit_encryption_enabled,
      auth_token_enabled,
      auto_minor_version_upgrade,
      snapshot_retention_limit,
      snapshot_window,
      preferred_maintenance_window,
      replication_group_id,
      cache_cluster_create_time,
      security_groups::text AS security_groups,
      region,
      tags
    FROM
      aws_elasticache_cluster
    WHERE
      cache_cluster_id = '{id}'
  `,

  // ElastiCache SG details / ElastiCache SG 상세
  ecSgDetail: `
    SELECT
      group_id, group_name, vpc_id,
      ip_permissions::text AS inbound_rules
    FROM
      aws_vpc_security_group
    WHERE
      group_id = '{sg_id}'
  `,

  // ElastiCache CloudWatch metrics / ElastiCache CloudWatch 메트릭
  ecMetrics: `
    SELECT
      metric_name, average, maximum, minimum, timestamp
    FROM
      aws_cloudwatch_metric_statistic_data_point
    WHERE
      namespace = 'AWS/ElastiCache'
      AND dimensions = '[{"Name":"CacheClusterId","Value":"{id}"}]'::jsonb
      AND metric_name IN ('CPUUtilization', 'FreeableMemory', 'CurrConnections', 'NetworkBytesIn', 'NetworkBytesOut', 'CacheHitRate')
      AND period = 300
      AND timestamp >= NOW() - INTERVAL '1 hour'
    ORDER BY metric_name, timestamp DESC
  `,

  clusterList: `
    SELECT
      account_id,
      cache_cluster_id,
      cache_node_type,
      engine,
      engine_version,
      cache_cluster_status,
      num_cache_nodes,
      replication_group_id,
      preferred_availability_zone,
      cache_subnet_group_name,
      at_rest_encryption_enabled,
      transit_encryption_enabled,
      auto_minor_version_upgrade,
      cache_cluster_create_time,
      cache_nodes::text AS cache_nodes,
      region
    FROM
      aws_elasticache_cluster
    ORDER BY
      cache_cluster_create_time DESC
  `,

  replicationGroupList: `
    SELECT
      replication_group_id,
      description,
      status,
      cache_node_type,
      cluster_enabled,
      multi_az,
      automatic_failover,
      at_rest_encryption_enabled,
      transit_encryption_enabled,
      snapshot_retention_limit,
      replication_group_create_time,
      region
    FROM
      aws_elasticache_replication_group
    ORDER BY
      replication_group_create_time DESC
  `
};
