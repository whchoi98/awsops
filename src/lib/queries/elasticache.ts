export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_elasticache_cluster) AS total_clusters,
      (SELECT COUNT(*) FROM aws_elasticache_replication_group) AS total_replication_groups,
      (SELECT COUNT(DISTINCT cache_node_type) FROM aws_elasticache_cluster) AS node_types,
      (SELECT COUNT(*) FROM aws_elasticache_cluster WHERE engine = 'redis') AS redis_count,
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
      region,
      tags
    FROM
      aws_elasticache_cluster
    WHERE
      cache_cluster_id = '{id}'
  `,

  clusterList: `
    SELECT
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
