export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_clusters,
      COUNT(*) FILTER (WHERE state = 'ACTIVE') AS active_clusters,
      COUNT(*) FILTER (WHERE state != 'ACTIVE') AS inactive_clusters,
      COUNT(*) FILTER (WHERE enhanced_monitoring != 'DEFAULT') AS enhanced_monitoring,
      COUNT(*) FILTER (WHERE encryption_info::text LIKE '%TLS%' OR encryption_info::text LIKE '%encryption%') AS encrypted_clusters
    FROM aws_msk_cluster
  `,

  list: `
    SELECT
      cluster_name,
      cluster_arn,
      state,
      cluster_type,
      kafka_version,
      number_of_broker_nodes,
      enhanced_monitoring,
      creation_time,
      encryption_info::text AS encryption_info,
      broker_node_group_info::text AS broker_info,
      tags ->> 'Name' AS name
    FROM aws_msk_cluster
    ORDER BY creation_time DESC
  `,

  stateDistribution: `
    SELECT state AS name, COUNT(*) AS value
    FROM aws_msk_cluster
    GROUP BY state
    ORDER BY value DESC
  `,

  versionDistribution: `
    SELECT kafka_version AS name, COUNT(*) AS value
    FROM aws_msk_cluster
    GROUP BY kafka_version
    ORDER BY value DESC
  `,

  // Cluster detail / 클러스터 상세
  detail: `
    SELECT
      cluster_name,
      cluster_arn,
      state,
      cluster_type,
      kafka_version,
      number_of_broker_nodes,
      enhanced_monitoring,
      creation_time,
      zookeeper_connect_string,
      encryption_info::text AS encryption_info,
      broker_node_group_info::text AS broker_info,
      open_monitoring::text AS open_monitoring,
      logging_info::text AS logging_info,
      current_version,
      tags::text AS tags
    FROM aws_msk_cluster
    WHERE cluster_name = '{cluster_name}'
  `,
};
