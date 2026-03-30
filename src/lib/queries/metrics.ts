export const queries = {
  ec2CpuHourly: `
    SELECT instance_id, timestamp,
      ROUND(average::numeric, 2) AS avg_cpu,
      ROUND(maximum::numeric, 2) AS max_cpu
    FROM aws_ec2_instance_metric_cpu_utilization_hourly
    WHERE timestamp >= NOW() - INTERVAL '24 hours'
    ORDER BY instance_id, timestamp DESC
  `,

  ec2CpuLatest: `
    SELECT DISTINCT ON (m.instance_id)
      i.account_id, m.instance_id, i.tags ->> 'Name' AS name, i.instance_type, i.instance_state,
      ROUND(m.average::numeric, 2) AS avg_cpu, ROUND(m.maximum::numeric, 2) AS max_cpu,
      m.timestamp
    FROM aws_ec2_instance_metric_cpu_utilization_hourly m
    JOIN aws_ec2_instance i ON m.instance_id = i.instance_id
    WHERE i.instance_state = 'running'
    ORDER BY m.instance_id, m.timestamp DESC
  `,

  ec2CpuDaily: `
    SELECT instance_id, timestamp,
      ROUND(average::numeric, 2) AS avg_cpu, ROUND(maximum::numeric, 2) AS max_cpu
    FROM aws_ec2_instance_metric_cpu_utilization_daily
    ORDER BY instance_id, timestamp DESC
  `,

  ebsIopsHourly: `
    SELECT v.volume_id, v.tags ->> 'Name' AS name, r.timestamp,
      ROUND(r.average::numeric, 0) AS read_iops,
      ROUND(w.average::numeric, 0) AS write_iops
    FROM aws_ebs_volume v
    LEFT JOIN aws_ebs_volume_metric_read_ops_hourly r ON v.volume_id = r.volume_id
    LEFT JOIN aws_ebs_volume_metric_write_ops_hourly w ON v.volume_id = w.volume_id AND r.timestamp = w.timestamp
    WHERE r.timestamp IS NOT NULL AND r.timestamp >= NOW() - INTERVAL '24 hours'
    ORDER BY v.volume_id, r.timestamp DESC
  `,

  ebsIopsLatest: `
    SELECT DISTINCT ON (r.volume_id)
      v.account_id, r.volume_id, v.tags ->> 'Name' AS name, v.volume_type, v.size, v.state,
      ROUND(r.average::numeric, 0) AS read_iops, r.timestamp
    FROM aws_ebs_volume_metric_read_ops_hourly r
    JOIN aws_ebs_volume v ON r.volume_id = v.volume_id
    ORDER BY r.volume_id, r.timestamp DESC
  `,

  rdsMetrics: `
    SELECT DISTINCT ON (c.db_instance_identifier)
      r.account_id, c.db_instance_identifier, c.engine, c.class AS db_instance_class,
      ROUND(c.average::numeric, 2) AS avg_cpu, ROUND(c.maximum::numeric, 2) AS max_cpu,
      c.timestamp
    FROM aws_rds_db_instance_metric_cpu_utilization_hourly c
    JOIN aws_rds_db_instance r ON c.db_instance_identifier = r.db_instance_identifier
    ORDER BY c.db_instance_identifier, c.timestamp DESC
  `,

  rdsConnections: `
    SELECT DISTINCT ON (db_instance_identifier)
      db_instance_identifier,
      ROUND(average::numeric, 0) AS avg_connections,
      ROUND(maximum::numeric, 0) AS max_connections, timestamp
    FROM aws_rds_db_instance_metric_connections_hourly
    ORDER BY db_instance_identifier, timestamp DESC
  `,

  rdsCpuDaily: `
    SELECT db_instance_identifier, timestamp,
      ROUND(average::numeric, 2) AS avg_cpu, ROUND(maximum::numeric, 2) AS max_cpu
    FROM aws_rds_db_instance_metric_cpu_utilization_daily
    WHERE timestamp >= NOW() - INTERVAL '30 days'
    ORDER BY db_instance_identifier, timestamp DESC
  `,

  // RDS Freeable Memory (latest per instance)
  rdsMemory: `
    SELECT DISTINCT ON (db_instance_identifier)
      db_instance_identifier,
      ROUND((average / 1073741824)::numeric, 2) AS free_mem_gb,
      ROUND((minimum / 1073741824)::numeric, 2) AS min_mem_gb,
      timestamp
    FROM aws_rds_db_instance_metric_cpu_utilization_hourly
    WHERE metric_name = 'FreeableMemory'
    ORDER BY db_instance_identifier, timestamp DESC
  `,

  // K8s Node Memory
  k8sNodeResources: `
    SELECT name,
      capacity ->> 'cpu' AS cap_cpu,
      capacity ->> 'memory' AS cap_mem,
      allocatable ->> 'cpu' AS alloc_cpu,
      allocatable ->> 'memory' AS alloc_mem,
      capacity ->> 'pods' AS cap_pods
    FROM kubernetes_node
  `,

  // RDS FreeableMemory time series (needs db_instance_identifier)
  rdsMemoryDetail: `
    SELECT timestamp,
      ROUND((average / 1073741824)::numeric, 3) AS avg_free_mem_gb
    FROM aws_cloudwatch_metric_statistic_data_point
    WHERE namespace = 'AWS/RDS'
      AND metric_name = 'FreeableMemory'
      AND period = 3600
      AND dimensions = '[{"Name": "DBInstanceIdentifier", "Value": "{db_id}"}]'::jsonb
    ORDER BY timestamp DESC
    LIMIT 24
  `,

  // EC2 Instance detail metrics with configurable period / EC2 인스턴스 상세 메트릭 (기간 설정 가능)
  ec2DetailMetrics: `
    SELECT metric_name, average, maximum, minimum, timestamp
    FROM aws_cloudwatch_metric_statistic_data_point
    WHERE namespace = 'AWS/EC2'
      AND dimensions = '[{"Name":"InstanceId","Value":"{instance_id}"}]'::jsonb
      AND metric_name IN ('CPUUtilization', 'NetworkIn', 'NetworkOut', 'DiskReadOps', 'DiskWriteOps', 'NetworkPacketsIn', 'NetworkPacketsOut')
      AND period = {period}
      AND timestamp >= NOW() - INTERVAL '{range}'
    ORDER BY metric_name, timestamp ASC
  `,

  // K8s per-node pod resource requests
  k8sNodePodResources: `
    SELECT node_name,
      COUNT(*) AS pod_count,
      SUM(COALESCE((r.value ->> 'cpu')::numeric, 0)) AS total_cpu_req_m
    FROM kubernetes_pod p,
      jsonb_array_elements(containers_resources_requests_std) AS r
    WHERE phase = 'Running'
    GROUP BY node_name
    ORDER BY node_name
  `,

  // EC2 Network In/Out: EC2 인스턴스 목록 + 네트워크 정보 / Instance list with network info
  // (Network 메트릭은 클릭 시 CloudWatch API로 조회 / Network metrics fetched on click via CloudWatch)
  ec2NetworkLatest: `
    SELECT
      i.account_id,
      i.instance_id,
      i.tags ->> 'Name' AS name,
      i.instance_type,
      i.instance_state,
      i.private_ip_address,
      i.public_ip_address,
      i.monitoring_state
    FROM aws_ec2_instance i
    WHERE i.instance_state = 'running'
    ORDER BY i.tags ->> 'Name', i.instance_id
  `,

  // Per-instance network (needs instance_id parameter)
  ec2NetworkDetail: `
    SELECT timestamp,
      ROUND((average / 1048576)::numeric, 2) AS avg_mb,
      ROUND((sum / 1048576)::numeric, 2) AS total_mb
    FROM aws_cloudwatch_metric_statistic_data_point
    WHERE namespace = 'AWS/EC2'
      AND metric_name = '{metric}'
      AND period = 3600
      AND dimensions = '[{"Name": "InstanceId", "Value": "{instance_id}"}]'::jsonb
    ORDER BY timestamp DESC
    LIMIT 24
  `,
};
