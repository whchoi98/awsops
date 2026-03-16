export const queries = {
  statusCount: `
    SELECT
      instance_state AS name,
      COUNT(*) AS value
    FROM
      aws_ec2_instance
    GROUP BY
      instance_state
  `,

  typeDistribution: `
    SELECT
      instance_type AS name,
      COUNT(*) AS value
    FROM
      aws_ec2_instance
    GROUP BY
      instance_type
    ORDER BY
      value DESC
  `,

  list: `
    SELECT
      account_id,
      instance_id,
      instance_state,
      instance_type,
      region,
      vpc_id,
      subnet_id,
      public_ip_address,
      private_ip_address,
      launch_time,
      tags ->> 'Name' AS name
    FROM
      aws_ec2_instance
    ORDER BY
      launch_time DESC
  `,

  detail: `
    SELECT
      i.account_id,
      i.instance_id,
      i.instance_state,
      i.instance_type,
      i.image_id,
      i.key_name,
      i.architecture,
      i.platform_details,
      i.virtualization_type,
      i.hypervisor,
      i.ebs_optimized,
      i.ena_support,
      i.monitoring_state,
      i.placement_availability_zone,
      i.placement_tenancy,
      i.private_ip_address,
      i.private_dns_name,
      i.public_ip_address,
      i.public_dns_name,
      i.vpc_id,
      i.subnet_id,
      i.cpu_options_core_count,
      i.cpu_options_threads_per_core,
      i.root_device_type,
      i.root_device_name,
      i.iam_instance_profile_arn,
      i.launch_time,
      i.state_transition_time,
      i.security_groups,
      i.block_device_mappings,
      i.network_interfaces,
      i.tags,
      i.region,
      t.memory_info ->> 'SizeInMiB' AS memory_mib,
      t.network_info ->> 'NetworkPerformance' AS network_performance,
      t.network_info ->> 'MaximumNetworkInterfaces' AS max_enis,
      t.instance_storage_supported
    FROM
      aws_ec2_instance i
    LEFT JOIN LATERAL (
      SELECT * FROM aws_ec2_instance_type WHERE instance_type = i.instance_type LIMIT 1
    ) t ON true
    WHERE
      i.instance_id = '{instance_id}'
  `,

  // Instance type specs (memory, vCPU, network) / 인스턴스 타입 사양 (메모리, vCPU, 네트워크)
  instanceTypeSpec: `
    SELECT
      instance_type,
      (memory_info ->> 'SizeInMiB')::int AS memory_mib,
      (v_cpu_info ->> 'DefaultVCpus')::int AS vcpus,
      (network_info ->> 'MaximumNetworkInterfaces')::int AS max_enis,
      network_info ->> 'NetworkPerformance' AS network_performance,
      instance_storage_supported
    FROM
      aws_ec2_instance_type
    WHERE
      instance_type = '{instance_type}'
  `,

  summary: `
    SELECT
      COUNT(*) AS total_instances,
      COUNT(*) FILTER (WHERE instance_state = 'running') AS running_instances,
      COALESCE(SUM(
        CASE
          WHEN instance_state = 'running' THEN (cpu_options_core_count * cpu_options_threads_per_core)
          ELSE 0
        END
      ), 0) AS total_vcpus
    FROM
      aws_ec2_instance
  `
};
