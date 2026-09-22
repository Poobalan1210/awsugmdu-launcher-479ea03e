# ==========================================
# KIRO UNIVERSITY BUILD-ALONG — campaign backend
#
# One Lambda behind /campaign/{proxy+} (routes internally), plus a scheduled
# EventBridge rule that invokes the same function directly to sweep GitHub.
#
# Progress tracking is polling, not webhooks: the challenge requires a PUBLIC
# repo, so no elevated access, no per-member install, and no secret on the
# participant's side. Follows the same single-greedy-proxy shape as kironomics.tf.
# ==========================================

variable "github_token" {
  description = <<-EOT
    Fine-grained GitHub PAT with PUBLIC REPO READ ONLY. Raises the API limit from
    60 req/hour (unauthenticated, shared across the Lambda's egress IP) to 5,000.
    No write scopes — if it leaks, the damage is read access to public data.
    Set via TF_VAR_github_token.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "campaign_sweep_rate" {
  description = <<-EOT
    How often to refresh GitHub stats. Six hours answers the 72-hour staleness
    question that drives lead outreach. Tighten to rate(1 minute) for a live
    demo, then put it back — a minute cadence burns quota for no decision value.
  EOT
  type        = string
  default     = "rate(6 hours)"
}

variable "campaign_default_id" {
  description = "Campaign the scheduled sweep runs against."
  type        = string
  default     = "kiro-university-2026"
}

# ------------------------------------------
# DYNAMODB
# ------------------------------------------

# One item per member per campaign. PK campaignId + SK userId gives both a direct
# get for /me and an efficient query for the leaderboard without a scan.
resource "aws_dynamodb_table" "campaign_participation" {
  name         = "${var.project_name}-campaign-participation"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "campaignId"
  range_key    = "userId"

  attribute {
    name = "campaignId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "repoFullName"
    type = "S"
  }

  # Enforces one repo per participant and one participant per repo. Without it,
  # someone could register a repo they do not own and farm the leaderboard.
  global_secondary_index {
    name            = "repoFullName-index"
    hash_key        = "repoFullName"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "${var.project_name}-campaign-participation-table"
  }
}

# Short-lived single-use codes that let the setup script authenticate without a
# browser. The permanent Kironomics token is never put in a command line, so it
# cannot end up in shell history or a screenshot shared in a group chat.
# TTL lets DynamoDB clean these up on its own.
resource "aws_dynamodb_table" "campaign_setup_codes" {
  name         = "${var.project_name}-campaign-setup-codes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "code"

  attribute {
    name = "code"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-campaign-setup-codes-table"
  }
}

# ------------------------------------------
# IAM
# ------------------------------------------
resource "aws_iam_role_policy" "lambda_campaign" {
  name = "${var.project_name}-lambda-campaign-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ]
        Resource = [
          aws_dynamodb_table.campaign_participation.arn,
          "${aws_dynamodb_table.campaign_participation.arn}/index/*",
          aws_dynamodb_table.campaign_setup_codes.arn,
          # Needed to mint a Kironomics identity for a first-time participant
          # and to hand back an existing token during code claim.
          aws_dynamodb_table.kironomics.arn,
          "${aws_dynamodb_table.kironomics.arn}/index/*",
        ]
      },
      {
        # Read-only: display names for the leaderboard and admin role checks.
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = [aws_dynamodb_table.users.arn]
      },
    ]
  })
}

# ------------------------------------------
# LAMBDA
# ------------------------------------------
data "archive_file" "campaign_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/campaign-crud"
  output_path = "${path.module}/lambda/campaign-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

resource "aws_lambda_function" "campaign_crud" {
  filename         = data.archive_file.campaign_crud.output_path
  function_name    = "${var.project_name}-campaign-crud"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.campaign_crud.output_base64sha256
  runtime          = "nodejs20.x"

  # The sweep makes ~5 GitHub calls per repo, serially. 300s covers a cohort of
  # a few hundred with headroom; API requests finish well inside 30s.
  timeout     = 300
  memory_size = 512

  environment {
    variables = {
      PARTICIPATION_TABLE_NAME = aws_dynamodb_table.campaign_participation.name
      SETUP_CODES_TABLE_NAME   = aws_dynamodb_table.campaign_setup_codes.name
      KIRONOMICS_TABLE_NAME    = aws_dynamodb_table.kironomics.name
      USERS_TABLE_NAME         = aws_dynamodb_table.users.name
      GITHUB_TOKEN             = var.github_token
      ADMIN_EMAILS             = var.admin_emails
      DEFAULT_CAMPAIGN_ID      = var.campaign_default_id
    }
  }

  tags = {
    Name = "${var.project_name}-campaign-crud"
  }
}

resource "aws_cloudwatch_log_group" "campaign_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.campaign_crud.function_name}"
  retention_in_days = 14
}

# ------------------------------------------
# API GATEWAY: /campaign and /campaign/{proxy+}
# ------------------------------------------
resource "aws_api_gateway_resource" "campaign" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "campaign"
}

resource "aws_api_gateway_resource" "campaign_proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.campaign.id
  path_part   = "{proxy+}"
}

# API Gateway authorization stays NONE because the Lambda derives identity from
# the Cognito token itself (extractUserId) and rejects unauthenticated writes
# with 401. Public reads — leaderboard and stats — are public by design.
resource "aws_api_gateway_method" "campaign_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.campaign.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "campaign_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.campaign_proxy.id
  http_method   = "ANY"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "campaign_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.campaign.id
  http_method             = aws_api_gateway_method.campaign_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.campaign_crud.invoke_arn
}

resource "aws_api_gateway_integration" "campaign_proxy_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.campaign_proxy.id
  http_method             = aws_api_gateway_method.campaign_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.campaign_crud.invoke_arn
}

resource "aws_lambda_permission" "apigw_campaign" {
  statement_id  = "AllowAPIGatewayInvokeCampaign"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.campaign_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ------------------------------------------
# EVENTBRIDGE: the sweep
# Invokes the Lambda directly (no API Gateway), so the handler detects it by the
# absence of httpMethod and runs runSweep() instead of routing.
# ------------------------------------------
resource "aws_cloudwatch_event_rule" "campaign_sweep" {
  name                = "${var.project_name}-campaign-sweep"
  description         = "Refresh GitHub progress stats for Kiro University participants"
  schedule_expression = var.campaign_sweep_rate

  tags = {
    Name = "${var.project_name}-campaign-sweep"
  }
}

resource "aws_cloudwatch_event_target" "campaign_sweep" {
  rule      = aws_cloudwatch_event_rule.campaign_sweep.name
  target_id = "campaign-crud"
  arn       = aws_lambda_function.campaign_crud.arn

  input = jsonencode({
    campaignId = var.campaign_default_id
  })
}

resource "aws_lambda_permission" "events_campaign_sweep" {
  statement_id  = "AllowEventBridgeInvokeCampaignSweep"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.campaign_crud.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.campaign_sweep.arn
}

# ------------------------------------------
# OUTPUTS
# ------------------------------------------
output "campaign_participation_table_name" {
  value       = aws_dynamodb_table.campaign_participation.name
  description = "Campaign participation DynamoDB table"
}

output "lambda_campaign_crud_arn" {
  value       = aws_lambda_function.campaign_crud.arn
  description = "ARN of the campaign Lambda"
}

output "campaign_github_token_configured" {
  # nonsensitive() is safe here: this is a boolean "is it set", not the token.
  # Worth surfacing because an unset token silently drops the sweep to 60
  # GitHub requests/hour shared across the Lambda's egress IP, which will
  # rate-limit and quietly stop updating the leaderboard.
  value       = nonsensitive(var.github_token != "")
  description = "False means the sweep will rate-limit against GitHub."
}
