export const queries = {
  // EKS cluster list with VPC info / EKS 클러스터 목록 + VPC 정보
  eksClusterList: `
    SELECT
      account_id,
      name AS cluster_name,
      status,
      version,
      endpoint,
      resources_vpc_config ->> 'VpcId' AS vpc_id,
      platform_version,
      created_at,
      region
    FROM
      aws_eks_cluster
    ORDER BY
      name
  `,

  nodeSummary: `
    SELECT
      COUNT(*) AS total_nodes,
      COUNT(*) FILTER (
        WHERE conditions::text LIKE '%"type":"Ready"%'
          AND conditions::text LIKE '%"status":"True"%'
      ) AS ready_nodes
    FROM
      kubernetes_node
  `,

  podSummary: `
    SELECT
      COUNT(*) AS total_pods,
      COUNT(*) FILTER (WHERE phase = 'Running') AS running_pods,
      COUNT(*) FILTER (WHERE phase = 'Pending') AS pending_pods,
      COUNT(*) FILTER (WHERE phase = 'Failed') AS failed_pods,
      COUNT(*) FILTER (WHERE phase = 'Succeeded') AS succeeded_pods
    FROM
      kubernetes_pod
  `,

  podList: `
    SELECT
      name,
      namespace,
      phase,
      node_name,
      pod_ip,
      creation_timestamp,
      restart_policy,
      service_account_name,
      context_name
    FROM
      kubernetes_pod
    ORDER BY
      namespace, name
  `,

  deploymentList: `
    SELECT
      name,
      namespace,
      replicas,
      ready_replicas,
      available_replicas,
      unavailable_replicas,
      creation_timestamp,
      strategy,
      context_name
    FROM
      kubernetes_deployment
    ORDER BY
      namespace, name
  `,

  serviceList: `
    SELECT
      name,
      namespace,
      type,
      cluster_ip,
      external_ip,
      creation_timestamp,
      selector,
      context_name
    FROM
      kubernetes_service
    ORDER BY
      namespace, name
  `,

  namespaceSummary: `
    SELECT
      name,
      phase,
      creation_timestamp,
      labels
    FROM
      kubernetes_namespace
    ORDER BY
      name
  `,

  podsPerNamespace: `
    SELECT
      namespace,
      context_name,
      COUNT(*) AS pod_count
    FROM
      kubernetes_pod
    GROUP BY
      namespace, context_name
    ORDER BY
      pod_count DESC
  `,

  pvcList: `
    SELECT
      name,
      namespace,
      phase,
      storage_class,
      volume_name,
      capacity::text as capacity,
      access_modes::text as access_modes,
      creation_timestamp,
      context_name
    FROM
      kubernetes_persistent_volume_claim
    ORDER BY
      namespace, name
  `,

  warningEvents: `
    SELECT
      name,
      namespace,
      type,
      reason,
      message,
      last_timestamp,
      context_name
    FROM
      kubernetes_event
    WHERE
      type = 'Warning'
    ORDER BY
      last_timestamp DESC
    LIMIT 50
  `,

  replicasetList: `
    SELECT
      name,
      namespace,
      replicas,
      ready_replicas,
      available_replicas,
      creation_timestamp,
      context_name
    FROM
      kubernetes_replicaset
    ORDER BY
      namespace, name
  `,

  daemonsetList: `
    SELECT
      name,
      namespace,
      desired_number_scheduled,
      current_number_scheduled,
      number_ready,
      number_available,
      number_misscheduled,
      creation_timestamp,
      context_name
    FROM
      kubernetes_daemonset
    ORDER BY
      namespace, name
  `,

  statefulsetList: `
    SELECT
      name,
      namespace,
      replicas,
      ready_replicas,
      current_replicas,
      creation_timestamp,
      service_name,
      context_name
    FROM
      kubernetes_stateful_set
    ORDER BY
      namespace, name
  `,

  jobList: `
    SELECT
      name,
      namespace,
      active,
      succeeded,
      failed,
      completions,
      parallelism,
      start_time,
      completion_time,
      creation_timestamp,
      context_name
    FROM
      kubernetes_job
    ORDER BY
      creation_timestamp DESC
  `,

  configmapList: `
    SELECT
      name,
      namespace,
      creation_timestamp,
      data,
      context_name
    FROM
      kubernetes_config_map
    ORDER BY
      namespace, name
  `,

  secretList: `
    SELECT
      name,
      namespace,
      type,
      creation_timestamp,
      context_name
    FROM
      kubernetes_secret
    ORDER BY
      namespace, name
  `,

  deploymentSummary: `
    SELECT
      COUNT(*) AS total_deployments,
      COUNT(*) FILTER (WHERE available_replicas = replicas AND replicas > 0) AS fully_available,
      COUNT(*) FILTER (WHERE available_replicas < replicas OR available_replicas IS NULL) AS partially_available
    FROM
      kubernetes_deployment
  `,

  // ── Describe-level queries (on-demand, single resource) ──

  podDescribe: `
    SELECT name, namespace, phase, node_name, pod_ip, host_ip,
      creation_timestamp, restart_policy, service_account_name,
      qos_class, priority, dns_policy, context_name,
      labels, annotations, containers, init_containers,
      volumes, conditions, tolerations, node_selector, owner_references
    FROM kubernetes_pod
  `,

  deploymentDescribe: `
    SELECT name, namespace, replicas, ready_replicas, available_replicas,
      unavailable_replicas, creation_timestamp, strategy, context_name,
      labels, annotations, conditions, selector
    FROM kubernetes_deployment
  `,

  serviceDescribe: `
    SELECT name, namespace, type, cluster_ip, external_ip,
      creation_timestamp, context_name,
      labels, annotations, ports, selector
    FROM kubernetes_service
  `,

  replicasetDescribe: `
    SELECT name, namespace, replicas, ready_replicas, available_replicas,
      creation_timestamp, context_name,
      labels, annotations, conditions, selector
    FROM kubernetes_replicaset
  `,

  daemonsetDescribe: `
    SELECT name, namespace, desired_number_scheduled, current_number_scheduled,
      number_ready, number_available, number_misscheduled,
      creation_timestamp, context_name,
      labels, annotations, conditions, selector
    FROM kubernetes_daemonset
  `,

  statefulsetDescribe: `
    SELECT name, namespace, replicas, ready_replicas, current_replicas,
      creation_timestamp, service_name, context_name,
      labels, annotations, conditions, selector
    FROM kubernetes_stateful_set
  `,

  jobDescribe: `
    SELECT name, namespace, active, succeeded, failed,
      completions, parallelism, start_time, completion_time,
      creation_timestamp, context_name,
      labels, annotations, conditions
    FROM kubernetes_job
  `,

  configmapDescribe: `
    SELECT name, namespace, creation_timestamp, data, context_name,
      labels, annotations
    FROM kubernetes_config_map
  `,

  secretDescribe: `
    SELECT name, namespace, type, creation_timestamp, context_name,
      labels, annotations
    FROM kubernetes_secret
  `,

  pvcDescribe: `
    SELECT name, namespace, phase, storage_class, volume_name,
      capacity::text as capacity, access_modes::text as access_modes,
      creation_timestamp, context_name,
      labels, annotations
    FROM kubernetes_persistent_volume_claim
  `
};
