export const queries = {
  // Dashboard summary: total cost for current month / 대시보드 요약: 이번 달 총 비용
  summary: `
    SELECT
      ROUND(SUM(COALESCE(unblended_cost_amount, blended_cost_amount, 0))::numeric, 2) AS total_cost,
      MIN(period_start) AS period_start,
      MAX(period_end) AS period_end
    FROM
      aws_cost_by_service_monthly
    WHERE
      period_start >= date_trunc('month', CURRENT_DATE)
  `,

  monthlyCost: `
    SELECT
      period_start,
      period_end,
      service,
      ROUND(COALESCE(unblended_cost_amount, blended_cost_amount, 0)::numeric, 2) AS cost,
      unblended_cost_unit AS currency
    FROM
      aws_cost_by_service_monthly
    ORDER BY
      period_start DESC, COALESCE(unblended_cost_amount, blended_cost_amount, 0) DESC
  `,

  dailyCost: `
    SELECT
      period_start,
      period_end,
      service,
      ROUND(COALESCE(unblended_cost_amount, blended_cost_amount, 0)::numeric, 2) AS cost,
      unblended_cost_unit AS currency
    FROM
      aws_cost_by_service_daily
    ORDER BY
      period_start DESC, COALESCE(unblended_cost_amount, blended_cost_amount, 0) DESC
  `,

  serviceCost: `
    SELECT
      service AS name,
      ROUND(SUM(COALESCE(unblended_cost_amount, blended_cost_amount, 0))::numeric, 2) AS value
    FROM
      aws_cost_by_service_monthly
    WHERE
      period_start >= (CURRENT_DATE - INTERVAL '1 month')
    GROUP BY
      service
    HAVING
      SUM(COALESCE(unblended_cost_amount, blended_cost_amount, 0)) > 0
    ORDER BY
      value DESC
  `,

  serviceDetail: `
    SELECT
      service,
      period_start,
      period_end,
      ROUND(COALESCE(unblended_cost_amount, blended_cost_amount, 0)::numeric, 4) AS cost,
      unblended_cost_unit AS currency
    FROM
      aws_cost_by_service_monthly
    WHERE
      service = '{service}'
    ORDER BY
      period_start DESC
  `
};
