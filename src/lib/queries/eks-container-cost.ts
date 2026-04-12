// EKS container cost queries / EKS 컨테이너 비용 쿼리
// Cost estimated from Pod resource requests + EC2 node pricing
// Pod 리소스 요청 + EC2 노드 가격 기반 비용 추정
export const queries = {
  // Running pods with container resource requests / 실행 중 Pod + 컨테이너 리소스 요청
  podResourceRequests: `
    SELECT
      p.name AS pod_name,
      p.namespace,
      p.phase,
      p.node_name,
      p.pod_ip,
      p.creation_timestamp,
      p.context_name,
      c->>'name' AS container_name,
      c->'resources'->'requests'->>'cpu' AS cpu_request,
      c->'resources'->'requests'->>'memory' AS memory_request,
      c->'resources'->'limits'->>'cpu' AS cpu_limit,
      c->'resources'->'limits'->>'memory' AS memory_limit
    FROM
      kubernetes_pod p,
      jsonb_array_elements(p.containers) AS c
    WHERE
      p.phase = 'Running' AND p.node_name IS NOT NULL
    ORDER BY
      p.namespace, p.name
  `,

  // Node capacity and allocatable / 노드 용량 및 할당 가능량
  nodeCapacity: `
    SELECT
      name AS node_name,
      capacity_cpu,
      capacity_memory,
      allocatable_cpu,
      allocatable_memory,
      node_info ->> 'instanceType' AS instance_type,
      node_info ->> 'osImage' AS os_image,
      context_name
    FROM
      kubernetes_node
    ORDER BY
      name
  `,

  // Per-node pod request aggregation / 노드별 Pod 요청 집계
  nodeRequestAggregation: `
    SELECT
      p.node_name,
      COUNT(DISTINCT p.name) AS pod_count,
      COUNT(*) AS container_count
    FROM
      kubernetes_pod p,
      jsonb_array_elements(p.containers) AS c
    WHERE
      p.phase = 'Running' AND p.node_name IS NOT NULL
    GROUP BY
      p.node_name
    ORDER BY
      p.node_name
  `,

  // Namespace summary / 네임스페이스 요약
  namespaceSummary: `
    SELECT
      p.namespace,
      COUNT(DISTINCT p.name) AS pod_count
    FROM
      kubernetes_pod p
    WHERE
      p.phase = 'Running'
    GROUP BY
      p.namespace
    ORDER BY
      pod_count DESC
  `,
};
