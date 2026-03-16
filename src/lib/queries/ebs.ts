export const queries = {
  summary: `
    SELECT
      COUNT(*) AS total_volumes,
      COUNT(*) FILTER (WHERE state = 'in-use') AS in_use,
      COUNT(*) FILTER (WHERE state = 'available') AS available,
      COUNT(*) FILTER (WHERE encrypted = true) AS encrypted_count,
      COUNT(*) FILTER (WHERE encrypted = false) AS unencrypted_count,
      COALESCE(SUM(size), 0) AS total_size_gb,
      COALESCE(SUM(size) FILTER (WHERE state = 'in-use'), 0) AS in_use_size_gb,
      COALESCE(SUM(size) FILTER (WHERE state = 'available'), 0) AS available_size_gb
    FROM aws_ebs_volume
  `,

  typeDistribution: `
    SELECT volume_type AS name, COUNT(*) AS value
    FROM aws_ebs_volume
    GROUP BY volume_type
    ORDER BY value DESC
  `,

  stateDistribution: `
    SELECT state AS name, COUNT(*) AS value
    FROM aws_ebs_volume
    GROUP BY state
    ORDER BY value DESC
  `,

  encryptionDistribution: `
    SELECT
      CASE WHEN encrypted THEN 'Encrypted' ELSE 'Unencrypted' END AS name,
      COUNT(*) AS value
    FROM aws_ebs_volume
    GROUP BY encrypted
  `,

  // Volume list with attachment info / 볼륨 목록 (어태치 정보 포함)
  list: `
    SELECT
      v.account_id,
      v.volume_id,
      v.volume_type,
      v.size,
      v.state,
      v.encrypted,
      v.iops,
      v.throughput,
      v.availability_zone,
      v.create_time,
      v.snapshot_id,
      v.kms_key_id,
      v.multi_attach_enabled,
      v.attachments::text AS attachments,
      v.tags ->> 'Name' AS name
    FROM aws_ebs_volume v
    ORDER BY v.create_time DESC
  `,

  // Volume detail with attachment mapping / 볼륨 상세 (어태치먼트 매핑)
  detail: `
    SELECT
      v.account_id,
      v.volume_id,
      v.volume_type,
      v.size,
      v.state,
      v.encrypted,
      v.iops,
      v.throughput,
      v.availability_zone,
      v.create_time,
      v.snapshot_id,
      v.kms_key_id,
      v.multi_attach_enabled,
      v.attachments::text AS attachments,
      v.tags::text AS tags
    FROM aws_ebs_volume v
    WHERE v.volume_id = '{volume_id}'
  `,

  // Snapshots for a volume / 볼륨의 스냅샷 목록
  volumeSnapshots: `
    SELECT
      snapshot_id,
      volume_id,
      volume_size,
      state,
      encrypted,
      start_time,
      progress,
      description,
      tags ->> 'Name' AS name
    FROM aws_ebs_snapshot
    WHERE volume_id = '{volume_id}'
    ORDER BY start_time DESC
    LIMIT 20
  `,

  // Snapshot summary / 스냅샷 요약
  snapshotSummary: `
    SELECT
      COUNT(*) AS total_snapshots,
      COUNT(*) FILTER (WHERE encrypted = true) AS encrypted_snapshots,
      COALESCE(SUM(volume_size), 0) AS total_snapshot_size_gb
    FROM aws_ebs_snapshot
  `,

  // Snapshot list / 스냅샷 전체 목록
  snapshotList: `
    SELECT
      s.snapshot_id,
      s.volume_id,
      s.volume_size,
      s.state,
      s.encrypted,
      s.start_time,
      s.progress,
      s.description,
      s.tags ->> 'Name' AS name
    FROM aws_ebs_snapshot s
    ORDER BY s.start_time DESC
    LIMIT 200
  `,

  // Attached instance lookup / 어태치된 인스턴스 조회
  attachedInstance: `
    SELECT
      instance_id,
      instance_state,
      instance_type,
      tags ->> 'Name' AS instance_name
    FROM aws_ec2_instance
    WHERE instance_id = '{instance_id}'
  `,
};
