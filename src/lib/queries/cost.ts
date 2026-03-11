export const queries = {
  // Dashboard summary: total cost for current month / 대시보드 요약: 이번 달 총 비용
  summary: `
    SELECT
      ROUND(SUM(unblended_cost_amount)::numeric, 2) AS total_cost,
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
      ROUND(blended_cost_amount::numeric, 2) AS blended_cost,
      ROUND(unblended_cost_amount::numeric, 2) AS unblended_cost,
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
      ROUND(blended_cost_amount::numeric, 2) AS blended_cost,
      ROUND(unblended_cost_amount::numeric, 2) AS unblended_cost,
      blended_cost_unit AS currency
    FROM
      aws_cost_by_service_daily
    ORDER BY
      period_start DESC, unblended_cost_amount DESC
  `,

  serviceCost: `
    SELECT
      service AS name,
      ROUND(SUM(unblended_cost_amount)::numeric, 2) AS value
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
      ROUND(blended_cost_amount::numeric, 4) AS blended_cost,
      ROUND(unblended_cost_amount::numeric, 4) AS unblended_cost,
      blended_cost_unit AS currency
    FROM
      aws_cost_by_service_monthly
    WHERE
      service = '{service}'
    ORDER BY
      period_start DESC
  `
};
