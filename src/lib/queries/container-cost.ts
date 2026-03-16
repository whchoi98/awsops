// ECS container cost queries / ECS 컨테이너 비용 쿼리
export const queries = {
  // Running tasks with metadata / 실행 중 Task 메타데이터
  ecsRunningTasks: `
    SELECT
      t.account_id,
      t.task_arn,
      split_part(t.task_arn, '/', 2) AS task_id,
      split_part(t.cluster_arn, '/', 2) AS cluster_name,
      t."group" AS service_name,
      t.cpu,
      t.memory,
      t.launch_type,
      t.last_status,
      t.started_at,
      t.availability_zone
    FROM aws_ecs_task t
    WHERE t.last_status = 'RUNNING'
    ORDER BY t.cluster_arn, t."group"
  `,

  // Service-level summary / 서비스별 요약
  ecsServiceSummary: `
    SELECT
      split_part(t.cluster_arn, '/', 2) AS cluster_name,
      t."group" AS service_name,
      t.launch_type,
      COUNT(*) AS task_count,
      SUM(t.cpu::int) AS total_cpu_units,
      SUM(t.memory::int) AS total_memory_mb
    FROM aws_ecs_task t
    WHERE t.last_status = 'RUNNING'
    GROUP BY split_part(t.cluster_arn, '/', 2), t."group", t.launch_type
    ORDER BY 1, 2
  `,

  // Cluster overview / 클러스터 개요
  ecsClusters: `
    SELECT
      account_id,
      cluster_name,
      status,
      registered_container_instances_count,
      running_tasks_count,
      active_services_count
    FROM aws_ecs_cluster
    ORDER BY cluster_name
  `,
};
