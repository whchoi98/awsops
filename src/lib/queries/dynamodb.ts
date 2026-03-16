export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_tables,
      COUNT(*) FILTER (WHERE table_status = 'ACTIVE') AS active_tables,
      COUNT(*) FILTER (WHERE billing_mode = 'PAY_PER_REQUEST') AS on_demand_tables,
      COUNT(*) FILTER (WHERE sse_description IS NOT NULL AND sse_description ->> 'Status' = 'ENABLED') AS encrypted_tables
    FROM
      aws_dynamodb_table
  `,

  detail: `
    SELECT
      account_id,
      name,
      arn,
      table_status,
      item_count,
      table_size_bytes,
      billing_mode,
      key_schema,
      read_capacity,
      write_capacity,
      point_in_time_recovery_description,
      sse_description,
      creation_date_time,
      region,
      tags
    FROM
      aws_dynamodb_table
    WHERE
      name = '{name}'
  `,

  tableList: `
    SELECT
      account_id,
      name,
      table_status,
      billing_mode,
      region,
      item_count,
      table_size_bytes,
      read_capacity,
      write_capacity,
      creation_date_time,
      point_in_time_recovery_description ->> 'PointInTimeRecoveryStatus' AS point_in_time_recovery,
      sse_description ->> 'Status' AS encryption_status,
      tags ->> 'Environment' AS environment
    FROM
      aws_dynamodb_table
    ORDER BY
      name
  `
};
