// Bedrock queries — reserved for future Steampipe-based queries
// Bedrock 쿼리 — 향후 Steampipe 기반 쿼리 예약
// Note: Main metrics come from CloudWatch via /api/bedrock-metrics
// 참고: 주요 메트릭은 /api/bedrock-metrics를 통해 CloudWatch에서 조회

export const queries = {
  // Foundation models list (for reference) / 파운데이션 모델 목록 (참고용)
  foundationList: `
    SELECT
      model_id,
      model_name,
      provider_name,
      input_modalities::text AS input_modalities,
      output_modalities::text AS output_modalities,
      inference_types_supported::text AS inference_types,
      model_lifecycle_status AS status
    FROM
      aws_bedrock_foundation_model
    ORDER BY
      provider_name, model_name
  `,
};
