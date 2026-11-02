# ==========================================
# BUILDER CENTER BACKFILL
#
# AWS Builder Center articles members wrote, imported as suggestions that each
# member claims onto their profile's blog history. One Lambda behind
# /builder-center/{proxy+}, the same greedy-proxy shape as campaign.tf.
#
# Challenge wins will be stored in the same table later (win#<id> items).
# ==========================================

# ------------------------------------------
# DYNAMODB
# ------------------------------------------

# PK userId + SK itemKey. A member's suggestions are one query. Two reserved
# partitions hold the table's own records: __settings__ (points config) and
# __claimed__ (one lock per claimed article, so only one account can own it).
resource "aws_dynamodb_table" "builder_content" {
  name         = "${var.project_name}-builder-content"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "itemKey"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "itemKey"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  # Holds which articles members claimed and the points they were given.
  deletion_protection_enabled = true

  tags = {
    Name = "${var.project_name}-builder-content-table"
  }
}

# Every live article in the public Builder Center feed, by author alias, as of
# the last weekly sync (about 43,000). When a member links their account, their
# past articles are found here at once, without reading the whole feed again.
# Rebuildable from the feed at any time, so no backups.
resource "aws_dynamodb_table" "builder_feed" {
  name         = "${var.project_name}-builder-feed"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "alias"
  range_key    = "contentId"

  attribute {
    name = "alias"
    type = "S"
  }

  attribute {
    name = "contentId"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-builder-feed-table"
  }
}

# ------------------------------------------
# IAM
# ------------------------------------------
# The Lambdas share one role. builder-center-crud also reads sprints and
# spotlight and updates users, which lambda_dynamodb already allows.
# users-crud deletes a member's items when their account is deleted.
resource "aws_iam_role_policy" "lambda_builder_content" {
  name = "${var.project_name}-lambda-builder-content-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:ConditionCheckItem",
        ]
        Resource = [
          aws_dynamodb_table.builder_content.arn,
          aws_dynamodb_table.builder_feed.arn,
        ]
      },
      {
        # The admin's "Run sync now" starts the sync, and a sync that runs out
        # of time hands over to a fresh run of itself.
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [aws_lambda_function.builder_center_sync.arn]
      },
    ]
  })
}

# ------------------------------------------
# LAMBDA
# ------------------------------------------
data "archive_file" "builder_center_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/builder-center-crud"
  output_path = "${path.module}/lambda/builder-center-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

resource "aws_lambda_function" "builder_center_crud" {
  filename         = data.archive_file.builder_center_crud.output_path
  function_name    = "${var.project_name}-builder-center-crud"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.builder_center_crud.output_base64sha256
  runtime          = "nodejs20.x"

  # An import of a few thousand rows writes in parallel batches and finishes
  # well inside API Gateway's 29 seconds; member requests take well under one.
  timeout     = 60
  memory_size = 512

  environment {
    variables = local.builder_center_env
  }

  tags = {
    Name = "${var.project_name}-builder-center-crud"
  }
}

resource "aws_cloudwatch_log_group" "builder_center_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.builder_center_crud.function_name}"
  retention_in_days = 14
}

locals {
  builder_center_env = {
    BUILDER_CONTENT_TABLE_NAME = aws_dynamodb_table.builder_content.name
    BUILDER_FEED_TABLE_NAME    = aws_dynamodb_table.builder_feed.name
    USERS_TABLE_NAME           = aws_dynamodb_table.users.name
    SPRINTS_TABLE_NAME         = aws_dynamodb_table.sprints.name
    SPOTLIGHT_TABLE_NAME       = aws_dynamodb_table.spotlight.name
    ADMIN_EMAILS               = var.admin_emails
    # Every route verifies the sign-in token's signature, not just reads it.
    COGNITO_USER_POOL_ID = aws_cognito_user_pool.user_pool.id
    COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.web_client.id
    # The admin's "Run sync now" starts this function.
    SYNC_FUNCTION_NAME = "${var.project_name}-builder-center-sync"
  }
}

# ------------------------------------------
# LAMBDA: the weekly sync
# Same code as the API, run by EventBridge with { task = "sync" }. Its own
# function so it can run for 15 minutes while API requests keep a short
# timeout. Reading the whole feed takes about 16 minutes, so a run that is
# about to time out saves its place and starts a fresh run of itself.
# ------------------------------------------
resource "aws_lambda_function" "builder_center_sync" {
  filename         = data.archive_file.builder_center_crud.output_path
  function_name    = "${var.project_name}-builder-center-sync"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.builder_center_crud.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 900
  memory_size      = 512

  environment {
    variables = local.builder_center_env
  }

  tags = {
    Name = "${var.project_name}-builder-center-sync"
  }
}

resource "aws_cloudwatch_log_group" "builder_center_sync_logs" {
  name              = "/aws/lambda/${aws_lambda_function.builder_center_sync.function_name}"
  retention_in_days = 14
}

# Once a week: Sunday 20:30 UTC, which is Monday 02:00 IST.
resource "aws_cloudwatch_event_rule" "builder_center_sync" {
  name                = "${var.project_name}-builder-center-sync"
  description         = "Weekly read of the public Builder Center feed for members' blogs and projects"
  schedule_expression = "cron(30 20 ? * SUN *)"

  tags = {
    Name = "${var.project_name}-builder-center-sync"
  }
}

resource "aws_cloudwatch_event_target" "builder_center_sync" {
  rule      = aws_cloudwatch_event_rule.builder_center_sync.name
  target_id = "builder-center-sync"
  arn       = aws_lambda_function.builder_center_sync.arn

  input = jsonencode({
    task    = "sync"
    trigger = "schedule"
  })
}

resource "aws_lambda_permission" "events_builder_center_sync" {
  statement_id  = "AllowEventBridgeInvokeBuilderCenterSync"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.builder_center_sync.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.builder_center_sync.arn
}

# A sync handing over to its next run must not be retried on top of it.
resource "aws_lambda_function_event_invoke_config" "builder_center_sync" {
  function_name          = aws_lambda_function.builder_center_sync.function_name
  maximum_retry_attempts = 0
}

# ------------------------------------------
# API GATEWAY: /builder-center and /builder-center/{proxy+}
# ------------------------------------------
resource "aws_api_gateway_resource" "builder_center" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "builder-center"
}

resource "aws_api_gateway_resource" "builder_center_proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.builder_center.id
  path_part   = "{proxy+}"
}

# Authorization stays NONE at the gateway: the Lambda verifies the Cognito ID
# token itself and rejects member and admin routes without a valid one. A
# member's claimed articles are public by design.
resource "aws_api_gateway_method" "builder_center_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.builder_center.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "builder_center_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.builder_center_proxy.id
  http_method   = "ANY"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "builder_center_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.builder_center.id
  http_method             = aws_api_gateway_method.builder_center_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.builder_center_crud.invoke_arn
}

resource "aws_api_gateway_integration" "builder_center_proxy_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.builder_center_proxy.id
  http_method             = aws_api_gateway_method.builder_center_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.builder_center_crud.invoke_arn
}

resource "aws_lambda_permission" "apigw_builder_center" {
  statement_id  = "AllowAPIGatewayInvokeBuilderCenter"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.builder_center_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ------------------------------------------
# OUTPUTS
# ------------------------------------------
output "builder_content_table_name" {
  value       = aws_dynamodb_table.builder_content.name
  description = "Builder Center suggestions, claims and points settings"
}
