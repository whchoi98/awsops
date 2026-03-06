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
      instance_id,
      instance_state,
      instance_type,
      image_id,
      key_name,
      architecture,
      platform_details,
      virtualization_type,
      hypervisor,
      ebs_optimized,
      ena_support,
      monitoring_state,
      placement_availability_zone,
      placement_tenancy,
      private_ip_address,
      private_dns_name,
      public_ip_address,
      public_dns_name,
      vpc_id,
      subnet_id,
      cpu_options_core_count,
      cpu_options_threads_per_core,
      root_device_type,
      root_device_name,
      iam_instance_profile_arn,
      launch_time,
      state_transition_time,
      security_groups,
      block_device_mappings,
      network_interfaces,
      tags,
      region
    FROM
      aws_ec2_instance
    WHERE
      instance_id = '{instance_id}'
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
