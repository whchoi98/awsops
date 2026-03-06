export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_cloudtrail_trail) AS total_trails,
      (SELECT COUNT(*) FROM aws_cloudtrail_trail WHERE is_logging = true) AS active_trails,
      (SELECT COUNT(*) FROM aws_cloudtrail_trail WHERE is_multi_region_trail = true) AS multi_region_trails,
      (SELECT COUNT(*) FROM aws_cloudtrail_trail WHERE log_file_validation_enabled = true) AS log_validated_trails
  `,

  trailList: `
    SELECT name, home_region, is_multi_region_trail, is_logging,
      log_file_validation_enabled, s3_bucket_name,
      is_organization_trail, include_global_service_events,
      latest_delivery_time, region
    FROM aws_cloudtrail_trail
    ORDER BY name
  `,

  trailDetail: `
    SELECT name, arn, home_region, is_multi_region_trail, is_logging,
      log_file_validation_enabled, s3_bucket_name, s3_key_prefix,
      sns_topic_arn, kms_key_id, log_group_arn, cloudwatch_logs_role_arn,
      is_organization_trail, include_global_service_events,
      has_custom_event_selectors, has_insight_selectors,
      latest_delivery_time, latest_delivery_error,
      latest_digest_delivery_time, latest_digest_delivery_error,
      latest_cloudwatch_logs_delivery_time, latest_cloudwatch_logs_delivery_error,
      start_logging_time, stop_logging_time, region, tags
    FROM aws_cloudtrail_trail
    WHERE name = '{name}'
  `,

  recentEvents: `
    SELECT event_id, event_name, event_source, username,
      event_time, read_only, resource_name, resource_type,
      access_key_id, cloud_trail_event
    FROM aws_cloudtrail_lookup_event
    ORDER BY event_time DESC
    LIMIT 20
  `,

  writeEvents: `
    SELECT event_id, event_name, event_source, username,
      event_time, resource_name, resource_type,
      access_key_id, cloud_trail_event
    FROM aws_cloudtrail_lookup_event
    WHERE read_only = 'false'
    ORDER BY event_time DESC
    LIMIT 20
  `
};
