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
      external_ips,
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
    SELECT name, namespace, type, cluster_ip, external_ips,
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
  `,

  // Service별 Pod 리소스 조회 — selector로 pod 매칭
  // CPU/Memory requests per service (join by selector → pod labels)
  serviceResources: `
    SELECT
      s.name AS service_name,
      s.namespace,
      p.name AS pod_name,
      c->>'name' AS container_name,
      c->'resources'->'requests'->>'cpu' AS cpu_request,
      c->'resources'->'requests'->>'memory' AS memory_request
    FROM kubernetes_service s
    JOIN kubernetes_pod p ON p.labels @> s.selector AND p.namespace = s.namespace
    CROSS JOIN jsonb_array_elements(p.containers) AS c
    WHERE p.phase = 'Running'
      AND s.selector IS NOT NULL
      AND s.selector != '{}'::jsonb
    ORDER BY s.namespace, s.name
  `,

  // ── Page-level queries (shared with cache-warmer) ──
  // K8s Overview page inline queries / K8s 개요 페이지 인라인 쿼리

  // Node list with status (K8s overview) / 노드 상세 목록 + 상태
  nodeList: `
    SELECT
      name, uid, pod_cidr, capacity_cpu, capacity_memory,
      allocatable_cpu, allocatable_memory, context_name,
      CASE WHEN jsonb_array_length(conditions) > 0 THEN 'Ready' ELSE 'NotReady' END as status
    FROM kubernetes_node
  `,

  // Node capacity (K8s explorer) / 노드 CPU/메모리 용량
  nodeCapacity: `
    SELECT
      name, capacity_cpu as cpu_capacity, capacity_memory as memory_capacity,
      allocatable_cpu, allocatable_memory, context_name
    FROM kubernetes_node
  `,

  // Pod resource requests (K8s overview) / 파드 리소스 요청
  podRequests: `
    SELECT
      p.node_name,
      c->'resources'->'requests'->>'cpu' AS cpu_req,
      c->'resources'->'requests'->>'memory' AS mem_req
    FROM
      kubernetes_pod p,
      jsonb_array_elements(p.containers) AS c
    WHERE
      p.phase = 'Running' AND p.node_name IS NOT NULL
  `,

  // Pod resource requests with context (K8s explorer) / 파드 리소스 요청 + context
  podRequestsWithContext: `
    SELECT
      p.node_name,
      c->'resources'->'requests'->>'cpu' AS cpu_req,
      c->'resources'->'requests'->>'memory' AS mem_req,
      p.context_name
    FROM
      kubernetes_pod p,
      jsonb_array_elements(p.containers) AS c
    WHERE
      p.phase = 'Running' AND p.node_name IS NOT NULL
  `,

  // Caller IAM role ARN (STS identity) / 현재 IAM 역할 ARN
  callerRole: `
    SELECT replace(replace(replace(arn, ':sts:', ':iam:'), ':assumed-role/', ':role/'), '/' || split_part(arn, '/', 3), '') as arn
    FROM aws_sts_caller_identity
  `
};
