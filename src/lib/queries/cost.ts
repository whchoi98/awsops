export const queries = {
  monthlyCost: `
    SELECT
      period_start,
      period_end,
      service,
      ROUND(CAST(blended_cost_amount AS numeric), 2) AS blended_cost,
      ROUND(CAST(unblended_cost_amount AS numeric), 2) AS unblended_cost,
      blended_cost_unit AS currency
    FROM
      aws_cost_by_service_monthly
    ORDER BY
      period_start DESC, unblended_cost_amount DESC
  `,

  dailyCost: `
    SELECT
      period_start,
      period_end,
      service,
      ROUND(CAST(blended_cost_amount AS numeric), 2) AS blended_cost,
      ROUND(CAST(unblended_cost_amount AS numeric), 2) AS unblended_cost,
      blended_cost_unit AS currency
    FROM
      aws_cost_by_service_daily
    ORDER BY
      period_start DESC, unblended_cost_amount DESC
  `,

  serviceCost: `
    SELECT
      service AS name,
      ROUND(CAST(SUM(unblended_cost_amount) AS numeric), 2) AS value
    FROM
      aws_cost_by_service_monthly
    WHERE
      period_start >= (CURRENT_DATE - INTERVAL '1 month')
    GROUP BY
      service
    HAVING
      SUM(unblended_cost_amount) > 0
    ORDER BY
      value DESC
  `,

  serviceDetail: `
    SELECT
      service,
      period_start,
      period_end,
      ROUND(CAST(blended_cost_amount AS numeric), 4) AS blended_cost,
      ROUND(CAST(unblended_cost_amount AS numeric), 4) AS unblended_cost,
      blended_cost_unit AS currency
    FROM
      aws_cost_by_service_monthly
    WHERE
      service = '{service}'
    ORDER BY
      period_start DESC
  `
};
