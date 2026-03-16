// MSK data is nested in `provisioned` JSONB column
// MSK 데이터는 `provisioned` JSONB 컬럼에 중첩됨
export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_clusters,
      COUNT(*) FILTER (WHERE state = 'ACTIVE') AS active_clusters,
      COUNT(*) FILTER (WHERE state != 'ACTIVE') AS inactive_clusters,
      SUM((provisioned ->> 'NumberOfBrokerNodes')::int) AS total_brokers,
      COUNT(*) FILTER (WHERE provisioned -> 'EnhancedMonitoring' IS NOT NULL
        AND provisioned ->> 'EnhancedMonitoring' != 'DEFAULT') AS enhanced_monitoring,
      COUNT(*) FILTER (WHERE provisioned -> 'EncryptionInfo' -> 'EncryptionInTransit' ->> 'InCluster' = 'true') AS encrypted_in_transit
    FROM aws_msk_cluster
  `,

  list: `
    SELECT
      account_id,
      cluster_name,
      arn AS cluster_arn,
      state,
      cluster_type,
      provisioned -> 'CurrentBrokerSoftwareInfo' ->> 'KafkaVersion' AS kafka_version,
      (provisioned ->> 'NumberOfBrokerNodes')::int AS number_of_broker_nodes,
      provisioned ->> 'EnhancedMonitoring' AS enhanced_monitoring,
      provisioned -> 'BrokerNodeGroupInfo' ->> 'InstanceType' AS instance_type,
      provisioned -> 'BrokerNodeGroupInfo' -> 'StorageInfo' -> 'EbsStorageInfo' ->> 'VolumeSize' AS ebs_volume_gb,
      creation_time,
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
    SELECT
      provisioned -> 'CurrentBrokerSoftwareInfo' ->> 'KafkaVersion' AS name,
      COUNT(*) AS value
    FROM aws_msk_cluster
    GROUP BY 1
    ORDER BY value DESC
  `,

  // Cluster detail / 클러스터 상세
  detail: `
    SELECT
      account_id,
      cluster_name,
      arn AS cluster_arn,
      state,
      cluster_type,
      current_version,
      creation_time,
      bootstrap_broker_string,
      bootstrap_broker_string_tls,
      provisioned::text AS provisioned,
      tags::text AS tags
    FROM aws_msk_cluster
    WHERE cluster_name = '{cluster_name}'
  `,
};
