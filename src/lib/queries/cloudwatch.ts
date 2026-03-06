export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_alarms,
      COUNT(*) FILTER (WHERE state_value = 'ALARM') AS in_alarm,
      COUNT(*) FILTER (WHERE state_value = 'OK') AS ok_state,
      COUNT(*) FILTER (WHERE state_value = 'INSUFFICIENT_DATA') AS insufficient_data
    FROM
      aws_cloudwatch_alarm
  `,

  detail: `
    SELECT
      name,
      arn,
      state_value,
      state_reason,
      namespace,
      metric_name,
      comparison_operator,
      threshold,
      period,
      evaluation_periods,
      statistic,
      actions_enabled,
      alarm_actions,
      ok_actions,
      insufficient_data_actions,
      region
    FROM
      aws_cloudwatch_alarm
    WHERE
      name = '{name}'
  `,

  alarmList: `
    SELECT
      name,
      namespace,
      metric_name,
      state_value,
      state_reason,
      state_updated_timestamp,
      comparison_operator,
      threshold,
      evaluation_periods,
      period,
      statistic,
      actions_enabled,
      region
    FROM
      aws_cloudwatch_alarm
    ORDER BY
      state_value DESC, state_updated_timestamp DESC
  `,

  namespaceDistribution: `
    SELECT
      namespace AS name,
      COUNT(*) AS value
    FROM
      aws_cloudwatch_alarm
    GROUP BY
      namespace
    ORDER BY
      value DESC
  `
};
