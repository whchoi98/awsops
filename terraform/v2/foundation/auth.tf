resource "aws_cognito_user_pool" "main" {
  name                     = "${var.project}-pool"
  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]
  mfa_configuration        = "OFF"

  # Third half of the self-service-email fix (PR #203 review MAJOR, 2 models). Narrowing
  # write_attributes stops an EXISTING account from changing its email, but the pool allowed public
  # SignUp, so whoever holds a departed colleague's reassigned mailbox could just create a NEW account
  # on that address and self-verify it via the emailed code (auto_verified_attributes = email) —
  # inheriting that person's legacy email-keyed rows for as long as legacy_email_owner_match is on.
  # This is an internal ops dashboard: accounts are provisioned, never self-registered.
  #
  # It only closes FUTURE signups — an account that already self-registered keeps working, with a
  # verified email it chose (codex stop-gate). Applying this is therefore step 1 of 2; step 2 is the
  # one-time roster reconciliation in docs/runbooks/v1-decommission.md (list the pool, disable anything
  # that is not a known operator). Terraform cannot do that part: Cognito records no "created by"
  # provenance, so deciding which existing accounts are legitimate is a human judgement.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # And the other half of the same threat: self-service RECOVERY. `ForgotPassword` /
  # `ConfirmForgotPassword` are unsigned public APIs and the code goes to the account's email, so whoever
  # holds a departed colleague's reassigned mailbox could reset that account's password and take it over
  # — inheriting the sub-keyed rows too, not just the email-keyed ones. Blocking signup does nothing about
  # accounts that already exist, and MFA only helps for accounts already ENROLLED (an unenrolled one lets
  # the attacker finish MFA_SETUP themselves). `admin_only` removes the self-service path outright, which
  # is the control that actually closes it (PR #203 review; previously recorded as accepted residual risk).
  #
  # The cost: users cannot reset their own password. That matches how this pool already works — accounts
  # are admin-created (above) and the self-hosted /login does not implement Cognito challenges anyway, so
  # a forgotten password is already an operator task: `admin-set-user-password --permanent`, per
  # docs/runbooks/v1-decommission.md. An operator with AWS credentials can always recover any account,
  # including the last admin.
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "main" {
  name                                 = "${var.project}-client"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false # public client + PKCE (no secret in edge code)
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true
  callback_urls                        = [for d in concat([var.domain_name], var.extra_domain_aliases) : "https://${d}/_callback"]
  logout_urls                          = [for d in concat([var.domain_name], var.extra_domain_aliases) : "https://${d}/"]

  # USER_PASSWORD_AUTH powers the self-hosted /login form's BFF InitiateAuth call; the Hosted UI
  # authorization-code (PKCE) flow above coexists as the edge dark fallback. No ALLOW_REFRESH_TOKEN_AUTH:
  # the refresh flow is not implemented (least privilege — the BFF discards the RefreshToken immediately).
  # Token lifetimes are declared explicitly to match the live deployment (id/access = 12h).
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH"]

  # Second half of the self-service-email fix (PR #203 review MAJOR, 2 models). The legacy ownership
  # branch authorizes reads on the token's `email` claim, and by default this client can write EVERY
  # standard attribute — so an ordinary user could UpdateUserAttributes their own email to a departed
  # colleague's address and inherit that person's legacy rows. Narrowing write_attributes to the
  # harmless ones removes the ability entirely. Note this also drops `email_verified` from the
  # writable set, which is the part that makes verifyUser()'s email_verified check meaningful — by
  # default a client can write that flag too, so a user could have self-verified whatever address
  # they had just set and the token check would have passed. read_attributes must stay broad: the BFF
  # needs `email` on READ; only WRITING it is the escalation. Admin APIs (AdminCreateUser, used by
  # aws_cognito_user.admin below) are NOT constrained by client attribute lists.
  read_attributes  = ["email", "email_verified", "name"]
  write_attributes = ["name"]

  id_token_validity     = 12
  access_token_validity = 12
  token_validity_units {
    id_token     = "hours"
    access_token = "hours"
  }
}

resource "aws_cognito_user" "admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = var.admin_email
  password     = var.admin_password
  attributes = {
    email          = var.admin_email
    email_verified = true
  }
}

data "aws_iam_policy_document" "edge_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "edge" {
  name               = "${var.project}-edge-auth"
  assume_role_policy = data.aws_iam_policy_document.edge_assume.json
}

resource "aws_iam_role_policy_attachment" "edge_basic" {
  role       = aws_iam_role.edge.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "random_password" "edge_state_key" {
  length  = 48
  special = false
}

locals {
  edge_src = templatefile("${path.module}/edge-lambda/cognito_edge.py.tftpl", {
    client_id      = aws_cognito_user_pool_client.main.id
    cognito_domain = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
    region         = var.region
    user_pool_id   = aws_cognito_user_pool.main.id
    state_key      = random_password.edge_state_key.result
  })
}

data "archive_file" "edge" {
  type        = "zip"
  output_path = "${path.module}/.build/cognito_edge.zip"
  source {
    content  = local.edge_src
    filename = "cognito_edge.py"
  }
}

resource "aws_lambda_function" "edge" {
  provider         = aws.use1
  function_name    = "${var.project}-cognito-auth"
  runtime          = "python3.12"
  handler          = "cognito_edge.lambda_handler"
  role             = aws_iam_role.edge.arn
  filename         = data.archive_file.edge.output_path
  source_code_hash = data.archive_file.edge.output_base64sha256
  timeout          = 5
  memory_size      = 128
  publish          = true
}
