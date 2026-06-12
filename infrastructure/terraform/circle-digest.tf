# ==========================================
# Circle Digest — config-driven AgentCore dispatcher.
#
# ONE Lambda + ONE hourly schedule. Which circles get agent posts is decided at
# runtime from each circle's agentConfig (set in the Admin -> Circles UI), NOT
# from Terraform. Adding/removing an agent circle is a UI action, no deploy.
#
# The agent ARNs the Lambda may invoke are listed below and must match the
# AGENTS registry in lambda/circle-digest/index.js.
# ==========================================

variable "agent_runtime_arns" {
  description = "AgentCore runtime ARNs the circle-digest Lambda may invoke"
  type        = list(string)
  default = [
    "arn:aws:bedrock-agentcore:us-east-1:333105300941:runtime/awsnewsdigest-F6VbLM4VC5",
    "arn:aws:bedrock-agentcore:us-east-1:333105300941:runtime/awsjobs-GW1BCZ2qfj",
  ]
}

# --- Lambda package ---------------------------------------------------------
data "archive_file" "circle_digest" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/circle-digest"
  output_path = "${path.module}/lambda/circle-digest.zip"
  excludes    = ["node_modules", "*.zip"]
}

resource "aws_lambda_function" "circle_digest" {
  filename         = data.archive_file.circle_digest.output_path
  function_name    = "${var.project_name}-circle-digest"
  role             = aws_iam_role.circle_digest.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.circle_digest.output_base64sha256
  runtime          = "nodejs20.x"
  # Each agent call hits live RSS + a Bedrock model; allow for several due
  # circles per run.
  timeout     = 300
  memory_size = 256

  environment {
    variables = {
      CIRCLES_TABLE_NAME = aws_dynamodb_table.certification_groups.name
    }
  }

  tags = {
    Name = "${var.project_name}-circle-digest"
  }
}

resource "aws_cloudwatch_log_group" "circle_digest_logs" {
  name              = "/aws/lambda/${aws_lambda_function.circle_digest.function_name}"
  retention_in_days = 14
}

# --- Lambda execution role --------------------------------------------------
resource "aws_iam_role" "circle_digest" {
  name = "${var.project_name}-circle-digest-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "circle_digest_basic" {
  role       = aws_iam_role.circle_digest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB: scan circles, read+write the circle item (messages + agentConfig).
resource "aws_iam_role_policy" "circle_digest_dynamodb" {
  name = "${var.project_name}-circle-digest-dynamodb"
  role = aws_iam_role.circle_digest.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:Scan", "dynamodb:GetItem", "dynamodb:UpdateItem"]
      Resource = [aws_dynamodb_table.certification_groups.arn]
    }]
  })
}

# AgentCore: invoke only the specific agent runtimes (and their endpoints).
resource "aws_iam_role_policy" "circle_digest_agentcore" {
  name = "${var.project_name}-circle-digest-agentcore"
  role = aws_iam_role.circle_digest.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "bedrock-agentcore:InvokeAgentRuntime"
      Resource = concat(
        var.agent_runtime_arns,
        [for arn in var.agent_runtime_arns : "${arn}/*"]
      )
    }]
  })
}

# --- Hourly schedule (EventBridge Scheduler) --------------------------------
resource "aws_iam_role" "circle_digest_scheduler" {
  name = "${var.project_name}-circle-digest-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "circle_digest_scheduler_invoke" {
  name = "${var.project_name}-circle-digest-scheduler-invoke"
  role = aws_iam_role.circle_digest_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.circle_digest.arn
    }]
  })
}

# Fires every hour. The Lambda itself decides which circles are actually due
# based on each circle's agentConfig.frequency + lastRunAt.
resource "aws_scheduler_schedule" "circle_digest_hourly" {
  name       = "${var.project_name}-circle-digest-hourly"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = "cron(0 * * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.circle_digest.arn
    role_arn = aws_iam_role.circle_digest_scheduler.arn
  }
}

output "lambda_circle_digest_arn" {
  description = "Circle digest Lambda ARN"
  value       = aws_lambda_function.circle_digest.arn
}
