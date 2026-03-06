export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_ecs_cluster) AS total_clusters,
      (SELECT COUNT(*) FROM aws_ecs_service) AS total_services,
      (SELECT COUNT(*) FROM aws_ecs_task) AS total_tasks,
      (SELECT COALESCE(SUM(registered_container_instances_count), 0) FROM aws_ecs_cluster) AS total_container_instances
  `,

  clusterDetail: `
    SELECT
      cluster_name,
      cluster_arn,
      status,
      running_tasks_count,
      pending_tasks_count,
      active_services_count,
      registered_container_instances_count,
      settings,
      region,
      tags
    FROM
      aws_ecs_cluster
    WHERE
      cluster_name = '{name}'
  `,

  clusterList: `
    SELECT
      cluster_name,
      cluster_arn,
      status,
      registered_container_instances_count,
      running_tasks_count,
      pending_tasks_count,
      active_services_count,
      region,
      tags ->> 'Environment' AS environment
    FROM
      aws_ecs_cluster
    ORDER BY
      cluster_name
  `,

  serviceList: `
    SELECT
      service_name,
      cluster_arn,
      status,
      desired_count,
      running_count,
      pending_count,
      launch_type,
      scheduling_strategy,
      created_at,
      tags ->> 'Environment' AS environment
    FROM
      aws_ecs_service
    ORDER BY
      service_name
  `,

  taskList: `
    SELECT
      task_arn,
      cluster_arn,
      task_definition_arn,
      last_status,
      desired_status,
      launch_type,
      cpu,
      memory,
      started_at,
      connectivity,
      "group" AS group_name
    FROM
      aws_ecs_task
    ORDER BY
      started_at DESC
  `
};
