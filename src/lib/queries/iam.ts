export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_iam_user) AS total_users,
      (SELECT COUNT(*) FROM aws_iam_role) AS total_roles,
      (SELECT COUNT(*) FROM aws_iam_policy WHERE is_aws_managed = false) AS custom_policies,
      0 AS mfa_not_enabled
  `,

  userDetail: `
    SELECT
      name,
      user_id,
      arn,
      path,
      create_date,
      password_last_used
    FROM
      aws_iam_user
    WHERE
      name = '{name}'
  `,

  userList: `
    SELECT
      name,
      user_id,
      arn,
      create_date,
      password_last_used
    FROM
      aws_iam_user
    ORDER BY
      name
  `,

  roleList: `
    SELECT
      name,
      role_id,
      arn,
      create_date,
      max_session_duration,
      path,
      description
    FROM
      aws_iam_role
    ORDER BY
      name
  `,

  roleDetail: `
    SELECT
      name, arn, role_id, description, path,
      create_date, max_session_duration,
      role_last_used_date, role_last_used_region,
      instance_profile_arns,
      permissions_boundary_arn,
      assume_role_policy_document,
      region, tags
    FROM
      aws_iam_role
    WHERE
      name = '{name}'
  `
};
